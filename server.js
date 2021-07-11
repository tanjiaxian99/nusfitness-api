const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const MongoStore = require("connect-mongo");
const User = require("./models/user");
const cors = require("cors");
const dateFns = require("date-fns");
const telegram = require("./telegram_routes");
const requestTraffic = require("./traffic");

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

/** TELEGRAM HELPER METHODS */
const getEmail = async (chatId) => {
  const users = db.collection("users");
  const user = await users.findOne({ chatId });
  return user.email;
};

/** ROUTES */

app.use("/telegram", telegram);

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
  if (!req.isAuthenticated() && !req.body.chatId) {
    res.status(401).json({ success: false });
  } else {
    let email;
    const facility = req.body.facility;
    const date = new Date(req.body.date);

    // Unable to cancel slot if it is 2 hours before the actual slot
    const slotTime = dateFns.addHours(date, -2);
    const currentTime = new Date().getTime();
    if (slotTime < currentTime) {
      res.status(403).json({ success: false });
      return;
    }

    // Retrieve email
    if (req.isAuthenticated()) {
      email = req.user.email;
    } else {
      const chatId = parseInt(req.body.chatId);
      email = await getEmail(chatId);
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
  if (!req.isAuthenticated() && !req.body.chatId) {
    res.status(401).json({ success: false });
  } else {
    const bookingCollection = db.collection("booking");
    const facility = req.body.facility;
    const date = new Date(req.body.date);
    const maxCapacity = 20;
    let email;

    // Make sure count does not exceed max capacity in the event of multiple bookings
    const count = await bookingCollection.countDocuments({
      facility,
      date,
    });

    // Retrieve email
    if (req.isAuthenticated()) {
      email = req.user.email;
    } else {
      const chatId = parseInt(req.body.chatId);
      email = await getEmail(chatId);
    }

    if (count >= maxCapacity) {
      res.status(400).json({ success: false });
    } else {
      const booking = { email, facility, date };
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

app.post("/slots", async (req, res) => {
  const bookingCollection = db.collection("booking");
  const now = new Date();
  const facility = req.body.facility;
  const startDate = new Date(req.body.startDate);
  const endDate = req.body.endDate
    ? new Date(req.body.endDate)
    : new Date(req.body.startDate);

  try {
    const aggregate = await bookingCollection.aggregate([
      {
        $project: {
          facility: 1,
          date: 1,
        },
      },
      {
        $match: {
          facility,
          date: { $gte: startDate, $lt: endDate }, // Filter by date range
        },
      },
      {
        $group: {
          _id: "$date",
          count: { $sum: 1 },
        },
      },
    ]);
    res.json(await aggregate.toArray());
  } catch (err) {
    res.status(400).json(err);
  }
});

app.post("/bookedSlots", async (req, res) => {
  if (!req.isAuthenticated() && !req.body.chatId) {
    res.status(401).json("Unauthorized");
  } else {
    const facility = req.body.facility;
    let email;
    const bookingCollection = db.collection("booking");

    // Retrieve email
    if (req.isAuthenticated()) {
      email = req.user.email;
    } else {
      const chatId = parseInt(req.body.chatId);
      email = await getEmail(chatId);
    }

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
