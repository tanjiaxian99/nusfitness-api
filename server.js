const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const MongoStore = require("connect-mongo");
const User = require("./models/user");
const cors = require("cors");
const fetch = require("node-fetch");
const HTMLParser = require("node-html-parser");
const cookie = require("cookie");
const dateFns = require("date-fns");

require("dotenv").config();

// Heroku
// const uri = process.env.MONGODB_URI;

// mongoose.connect(uri, {
// 	useNewUrlParser: true,
// 	useUnifiedTopology: true,
// 	useCreateIndex: true,
// 	useFindAndModify: false
// })

// Localhost
mongoose.connect("mongodb://localhost:27017/nusfitness", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  useCreateIndex: true,
  useFindAndModify: false,
});

const db = mongoose.connection;
db.on("error", console.error.bind(console, "connection error:"));
db.once("open", () => {
  console.log("Database connected!");
});

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

// Session
const sessionConfig = {
  secret: "secret",
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: "mongodb://localhost:27017/nusfitness",
    collectionName: "sessions",
  }),
  cookie: {
    secure: false,
    maxAge: 30 * 1000 * 60 * 60 * 24,
  },
};

app.use(session(sessionConfig));

// Passport.js
app.use(passport.initialize());
app.use(passport.session());
passport.use(
  new LocalStrategy({ usernameField: "email" }, User.authenticate())
);

passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

app.get("/", (req, res) => {
  res.send("hello world!");
});

app.post("/register", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = new User({ email });
    const newUser = await User.register(user, password);
    req.login(newUser, (err) => {
      console.log(err);
    });
    res.json(newUser);
  } catch (err) {
    console.log(err);
    res.status(400).json(err);
  }
});

app.post("/login", passport.authenticate("local"), (req, res) => {
  res.status(200).json({ success: true });
});

app.get("/logout", (req, res) => {
  req.logout();
  res.status(200).json({ success: true });
});

app.post("/cancel", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ success: false });
  } else {
    const email = req.user.email;
    const { facility, date } = req.body;

    // Unable to cancel slot if it is 2 hours before the actual slot
    const slotTime = dateFns.addHours(new Date(date), -2);
    const currentTime = new Date().getTime();
    if (slotTime < currentTime) {
      res.status(403).json({ success: false });
      return;
    }

    // Slot can be cancelled
    const bookingCollection = db.collection("booking");
    const result = await bookingCollection.deleteOne({
      email,
      facility,
      date,
    });
    if (result.deletedCount === 0) {
      console.log("No documents matched the query. Deleted 0 documents.");
      res.status(404).json({ success: false });
    } else {
      res.status(200).json({ success: true });
    }
  }
});

app.post("/book", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ success: false });
  } else {
    const bookingCollection = db.collection("booking");
    const { facility, date } = req.body;
    const maxCapacity = 20;

    // Make sure count does not exceed max capacity in the event of multiple bookings
    const count = await bookingCollection.countDocuments({
      facility,
      date,
    });

    if (count >= maxCapacity) {
      res.status(400).json({ success: false });
    } else {
      const booking = { email: req.user.email, ...req.body };
      bookingCollection.insertOne(booking, (error, result) => {
        if (error) {
          console.log(error);
          res.status(400).json(error);
        } else {
          res.status(200).json({ success: true });
        }
      });
    }
  }
});

app.post("/slots", (req, res) => {
  const bookingCollection = db.collection("booking");
  const { facility, date } = req.body;
  bookingCollection.countDocuments(
    {
      facility,
      date,
    },
    (error, result) => {
      if (error) {
        res.status(400).json(error);
      } else {
        res.json(result);
      }
    }
  );
});

app.post("/bookedSlots", (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json("Unauthorized");
  } else {
    const email = req.user.email;
    const facility = req.body.facility;
    const bookingCollection = db.collection("booking");

    facility
      ? bookingCollection
          .find({
            email,
            facility,
          })
          .toArray()
          .then((result, error) => {
            if (result) {
              res.json(result);
            } else {
              res.status(400).json(error);
            }
          })
      : bookingCollection
          .find(
            {
              email,
            },
            { sort: [["date", -1]] }
          )
          .toArray()
          .then((result, error) => {
            if (result) {
              res.json(result);
            } else {
              res.status(400).json(error);
            }
          });
  }
});

app.get("/isLoggedIn", (req, res) => {
  const authenticated = req.isAuthenticated();
  res.json({ authenticated });
});

app.post("/traffic", async (req, res) => {
  const trafficCollection = db.collection("traffic");
  const facility = req.body.facility;
  const dateFilter = req.body.date;
  let dayFilter = req.body.day;

  // Convert date string to date object
  if (dateFilter != undefined) {
    Object.keys(dateFilter).map(
      (key) => (dateFilter[key] = new Date(dateFilter[key]))
    );
  }

  if (dayFilter == undefined) {
    dayFilter = [];
  }

  try {
    const aggregate = await trafficCollection.aggregate([
      {
        $project: {
          date: 1,
          traffic: 1,
          day: { $dayOfWeek: "$date" }, // Add a new field for the day of the week
        },
      },
      {
        $match: {
          date: dateFilter, // Filter by date range
          day: {
            $in: dayFilter, // Filter by day
          },
        },
      },
      {
        $group: {
          // Group by time
          _id: {
            hour: {
              $dateToString: { date: "$date", format: "%H", timezone: "+08" },
            },
            minute: {
              $dateToString: { date: "$date", format: "%M", timezone: "+08" },
            },
          },
          count: { $avg: { $arrayElemAt: ["$traffic", facility] } },
        },
      },
      { $sort: { _id: 1 } }, // Sort by time
      {
        $project: {
          // Create a date field containing data objects
          date: {
            $dateFromParts: {
              year: new Date().getFullYear(),
              month: new Date().getMonth() + 1, // getMonth is 0-index while month is 1-index
              day: new Date().getDate(),
              hour: { $convert: { input: "$_id.hour", to: "int" } },
              minute: { $convert: { input: "$_id.minute", to: "int" } },
              timezone: "+08",
            },
          },
          // Round count to 1 dp
          count: { $round: ["$count", 1] },
        },
      },
    ]);
    res.json(await aggregate.toArray());
  } catch (err) {
    res.status(400).json(err);
  }
});

// Request for pool/gym traffic
const requestTraffic = async () => {
  // Retrieve nuspw cookie
  let res = await fetch(
    "https://reboks.nus.edu.sg/nus_public_web/public/auth",
    {
      method: "get",
    }
  );
  const nuspwCookie = res.headers.get("set-cookie");

  // Retrieve SAMLRequest URL
  res = await fetch(
    "https://reboks.nus.edu.sg/nus_saml_provider/public/index.php/adfs/auth",
    {
      method: "get",
      referrer:
        "https://reboks.nus.edu.sg/nus_public_web/public/auth?redirect=%2Fnus_public_web%2Fpublic%2Fprofile%2Fbuypass%2Fgym",
      credentials: "include",
    }
  );
  const SAMLrequest = res.url;

  // Send login data and retrieve MSISLoopDetectionCookie
  res = await fetch(SAMLrequest, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      UserName: process.env.NUSNETID,
      Password: process.env.PASSWORD,
      AuthMethod: "FormsAuthentication",
    }),
    credentials: "include",
    redirect: "manual",
  });
  const MSISLoopDetectionCookie = res.headers.get("set-cookie");

  // Retrieve SAMLResponse
  res = await fetch(SAMLrequest, {
    method: "get",
    headers: {
      cookie: MSISLoopDetectionCookie,
    },
    credentials: "include",
  });
  let root = HTMLParser.parse(await res.text());
  const SAMLResponse =
    root.querySelector("input[type=hidden]").attributes.value;

  // Send SAMLResponse and retrieve SimpleSAML and SimpleSAMLAuthToken cookies
  res = await fetch(
    "https://reboks.nus.edu.sg/nus_saml_provider/public/saml/module.php/saml/sp/saml2-acs.php/reboks",
    {
      method: "post",
      body: new URLSearchParams({
        SAMLResponse: SAMLResponse,
        RelayState:
          "http://reboks.nus.edu.sg/nus_saml_provider/public/index.php/adfs/auth",
      }),
      redirect: "manual",
    }
  );
  let SimpleSAMLCookies = res.headers.get("set-cookie");
  const SimpleSAML = SimpleSAMLCookies.match(/SimpleSAML=\S+;/);
  const SimpleSAMLAuthToken = SimpleSAMLCookies.match(
    /SimpleSAMLAuthToken=\S+;/
  );
  SimpleSAMLCookies = SimpleSAML + " " + SimpleSAMLAuthToken;

  // Retrieve token
  res = await fetch(
    "https://reboks.nus.edu.sg/nus_saml_provider/public/index.php/adfs/auth",
    {
      method: "get",
      headers: {
        cookie: SimpleSAMLCookies,
      },
      credentials: "include",
    }
  );
  root = HTMLParser.parse(await res.text());
  const token = root.querySelector("input[type=hidden]").attributes.value;

  // Send token
  res = await fetch(
    "https://reboks.nus.edu.sg/nus_public_web/public/auth/redirectAdfs",
    {
      method: "post",
      headers: {
        cookie: SimpleSAMLCookies + " " + nuspwCookie,
      },
      body: new URLSearchParams({
        token,
      }),
      credentials: "include",
      redirect: "manual",
    }
  );

  // Retrieve pool traffic
  res = await fetch(
    "https://reboks.nus.edu.sg/nus_public_web/public/profile/buypass",
    {
      method: "get",
      headers: {
        cookie: SimpleSAMLCookies + " " + nuspwCookie,
      },
      credentials: "include",
    }
  );
  root = HTMLParser.parse(await res.text());
  const poolTraffic = root
    .querySelectorAll(".swimbox > b")
    .map((e) => parseInt(e.textContent));

  // Retrieve gym traffic
  res = await fetch(
    "https://reboks.nus.edu.sg/nus_public_web/public/profile/buypass/gym",
    {
      method: "get",
      headers: {
        cookie: SimpleSAMLCookies + " " + nuspwCookie,
      },
      credentials: "include",
    }
  );
  root = HTMLParser.parse(await res.text());
  const gymTraffic = root
    .querySelectorAll(".gymbox > b")
    .map((e) => parseInt(e.textContent));

  // Combine traffic
  const combinedTraffic = poolTraffic.concat(gymTraffic);
  return combinedTraffic;
};

// Updates traffic collection every 5 minutes
const updateTrafficCollection = async () => {
  let now = new Date();
  if (
    now.getHours() >= 7 &&
    now.getHours() <= 21 &&
    now.getMinutes() % 5 === 0 &&
    now.getSeconds() === 0
  ) {
    const date = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      now.getHours(),
      now.getMinutes()
    );

    // Update collection
    const traffic = await requestTraffic();
    const trafficCollection = db.collection("traffic");
    trafficCollection.insertOne({ date, traffic }, (err, res) => {
      if (err) {
        console.log(err);
      }
    });
  }

  // Set delay for next request
  now = new Date();
  const delay = 300000 - (now % 300000);
  setTimeout(updateTrafficCollection, delay);
};
updateTrafficCollection();

app.listen(process.env.PORT || 5000);
