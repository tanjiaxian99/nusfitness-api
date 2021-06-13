const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const MongoStore = require("connect-mongo");
const User = require("./models/user");
const cors = require("cors");
const fetch = require("node-fetch");

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
app.use(express.urlencoded());

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
    const { facility, date, hour } = req.body;

    // Unable to cancel slot if it is 2 hours before the actual slot
    const slotTime = new Date(date).setHours(parseInt(hour.slice(0, 2)) - 2);
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
      hour,
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
    const { facility, date, hour } = req.body;
    const maxCapacity = 20;

    // Make sure count does not exceed max capacity in the event of multiple bookings
    const count = await bookingCollection.countDocuments({
      facility,
      date,
      hour,
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
  const { facility, date, hour } = req.body;
  bookingCollection.countDocuments(
    {
      facility,
      date,
      hour,
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

    bookingCollection
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
      });
  }
});

app.get("/isLoggedIn", (req, res) => {
  const authenticated = req.isAuthenticated();
  res.json({ authenticated });
});

// Request for pool/gym traffic
const requestTraffic = async () => {
  /* ### Fetching login page ### */

  // const res = await fetch(
  //   "https://reboks.nus.edu.sg/nus_saml_provider/public/index.php/adfs/auth",
  //   {
  //     method: "get",
  //     referrer:
  //       "https://reboks.nus.edu.sg/nus_public_web/public/auth?redirect=%2Fnus_public_web%2Fpublic%2Fprofile%2Fbuypass%2Fgym",
  //     credentials: "include",
  //   }
  // );
  // const SAMLrequest = res.url;
  // const details = {
  //   UserName: "nusstu\\",
  //   Password: "",
  //   AuthMethod: "FormsAuthentication",
  // };
  // // const formBody = Object.keys(details)
  // //   .map(
  // //     (key) => encodeURIComponent(key) + "=" + encodeURIComponent(details[key])
  // //   )
  // //   .join("&");
  // // const formBody = new URLSearchParams(details);
  // const urlencoded = new URLSearchParams();
  // urlencoded.append("UserName", "nusstu\\");
  // urlencoded.append("Password", "");
  // urlencoded.append("AuthMethod", "FormsAuthentication");
  // console.log(urlencoded);
  // const re = await fetch(SAMLrequest, {
  //   method: "post",
  //   headers: {
  //     "Content-Type": "application/x-www-form-urlencoded",
  //     Origin: "https://reboks.nus.edu.sg",
  //     Referer:
  //       "https://reboks.nus.edu.sg/nus_saml_provider/public/index.php/adfs/auth",
  //   },
  //   body: urlencoded,
  //   credentials: "include",
  // });
  // // const test = await re.;
  // console.log(re.headers);

  /* ### Submitting form data using fetch ### */
  const myHeaders = new fetch.Headers();
  myHeaders.append("Origin", "https://reboks.nus.edu.sg");
  myHeaders.append(
    "Referer",
    "https://reboks.nus.edu.sg/nus_saml_provider/public/index.php/adfs/auth"
  );
  myHeaders.append("Content-Type", "application/x-www-form-urlencoded");
  myHeaders.append("Accept-Encoding", "gzip, deflate, br");
  myHeaders.append("Cache-Control", "no-cache");
  myHeaders.append("Access-Control-Allow-Origin", "http://localhost:5000");
  var urlencoded = new URLSearchParams();
  urlencoded.append(`UserName`, "nusstu\\");
  urlencoded.append("Password", "");
  urlencoded.append("AuthMethod", "FormsAuthentication");
  var requestOptions = {
    mode: "cors",
    method: "POST",
    headers: myHeaders,
    body: urlencoded,
    redirect: "follow",
  };
  const link =
    "https://vafs.nus.edu.sg/adfs/ls/?SAMLRequest=lVJdT%2BMwEPwrkd8TOx%2BijdVW6l11ohJwFS083Evl2htqXWIHr10d%2Fx43AR19AIkn2%2BOd2dnRzlB0bc%2BXwR%2FNPTwHQJ%2F861qDfPiYk%2BAMtwI1ciM6QO4l3y5vb3iRMd476620LflA%2BZohEMF5bQ1J1qs52UOVC1mrUpRM1AdZgWQTVtYNFGxa1ZMCxJWYqGnVlCR5BIeROSdRKNIRA6wNemF8hFiRp%2Bwqzcsdq3nOeDX9Q5JVnEYb4QfW0fseOaUn0WBmAmagQoZPVKgGaYuUJMt3cz%2BtwdCB24I7aQkP9zf%2F6Q4O9u%2BFQLzuz5PvYxwnrcDRPhxaLekZpJ1VoYWsP%2FbjG8ezSIXEAR0FSbJ5C%2FOHNkqbp69zPIxFyK93u026%2Bb3dkcXsrMuHXNziG3Zn9CNxNi7EXWy5Xm1snOMl%2BWVdJ%2FznjvIsHxCt0mYo5cFgD1I3GhShi7HD5ZYtXgE%3D&RelayState=http%3A%2F%2Freboks.nus.edu.sg%2Fnus_saml_provider%2Fpublic%2Findex.php%2Fadfs%2Fauth&SigAlg=http%3A%2F%2Fwww.w3.org%2F2001%2F04%2Fxmldsig-more%23rsa-sha256&Signature=SRh5P4ZTKJFNDWJ7xgjamRdUSPUHaI9vnU5laKuZlqO9xbEgAoEKxdvrg50VVE8AUzASokixFceENud2xEgNIJxbghnOEkLnJNkQE0gvHZyhhOwYTCAUWohk4PbB%2FAq3DEkCmKtfrB5WfEVQcWD0rN15pbDG5WBkmYOnJeYt1jjha0XOCtPHNum7rUbTerT%2FguaEN6o8%2FGFmrQxvdEjDKwfz%2BAhUpnTfO46J8dHAp8SrYhj90B7QY2htGCmyEfhDlOFdgTGcnJ4Dr9Xrr2kMZZ%2BJM6aIVDeYX96SK7qAQTolnoLuTGcTh%2BMoBQSxCsYI7qYAA%2BsXFKGbUtxYkYZekw%3D%3D";
  const test = "http://ptsv2.com/t/enc07-1623580799/post";
  const t1 = "https://webhook.site/f90c5232-6489-40ad-bebf-91fbbc6675e5";
  const t2 = "https://httpbin.org/post";
  fetch(link, requestOptions)
    // .then((response) => response.json())
    // .then((result) => console.log(result))
    .then((res) => console.log(res.headers))
    .catch((error) => console.log("error", error));

  /* ### Submitting form data using HTTPS ### */
  // const https = require("https");
  // const options = {
  //   hostname: "httpbin.org",
  //   path: "post",
  //   method: "POST",
  //   headers: { "Content-Type": "application/x-www-form-urlencoded" },
  //   body: urlencoded,
  // };
  // const post_req = https.request(options, (res) => {
  //   res.setEncoding("utf8");
  //   res.on("data", function (chunk) {
  //     console.log("Response: " + chunk);
  //   });
  // });
  // // post the data
  // post_req.write(urlencoded);
  // post_req.end();

  /* ### Submitting form data using axios ### */
  // const axios = require("axios");
  // const qs = require("qs");
  // let data = JSON.stringify({
  //   UserName: "nusstu\\",
  //   Password: "",
  //   AuthMethod: "FormsAuthentication",
  // });
  // let config = {
  //   method: "post",
  //   url: "https://vafs.nus.edu.sg/adfs/ls/?SAMLRequest=lVJdT%2BMwEPwrkd8TOx%2BijdVW6l11ohJwFS083Evl2htqXWIHr10d%2Fx43AR19AIkn2%2BOd2dnRzlB0bc%2BXwR%2FNPTwHQJ%2F861qDfPiYk%2BAMtwI1ciM6QO4l3y5vb3iRMd476620LflA%2BZohEMF5bQ1J1qs52UOVC1mrUpRM1AdZgWQTVtYNFGxa1ZMCxJWYqGnVlCR5BIeROSdRKNIRA6wNemF8hFiRp%2Bwqzcsdq3nOeDX9Q5JVnEYb4QfW0fseOaUn0WBmAmagQoZPVKgGaYuUJMt3cz%2BtwdCB24I7aQkP9zf%2F6Q4O9u%2BFQLzuz5PvYxwnrcDRPhxaLekZpJ1VoYWsP%2FbjG8ezSIXEAR0FSbJ5C%2FOHNkqbp69zPIxFyK93u026%2Bb3dkcXsrMuHXNziG3Zn9CNxNi7EXWy5Xm1snOMl%2BWVdJ%2FznjvIsHxCt0mYo5cFgD1I3GhShi7HD5ZYtXgE%3D&RelayState=http%3A%2F%2Freboks.nus.edu.sg%2Fnus_saml_provider%2Fpublic%2Findex.php%2Fadfs%2Fauth&SigAlg=http%3A%2F%2Fwww.w3.org%2F2001%2F04%2Fxmldsig-more%23rsa-sha256&Signature=SRh5P4ZTKJFNDWJ7xgjamRdUSPUHaI9vnU5laKuZlqO9xbEgAoEKxdvrg50VVE8AUzASokixFceENud2xEgNIJxbghnOEkLnJNkQE0gvHZyhhOwYTCAUWohk4PbB%2FAq3DEkCmKtfrB5WfEVQcWD0rN15pbDG5WBkmYOnJeYt1jjha0XOCtPHNum7rUbTerT%2FguaEN6o8%2FGFmrQxvdEjDKwfz%2BAhUpnTfO46J8dHAp8SrYhj90B7QY2htGCmyEfhDlOFdgTGcnJ4Dr9Xrr2kMZZ%2BJM6aIVDeYX96SK7qAQTolnoLuTGcTh%2BMoBQSxCsYI7qYAA%2BsXFKGbUtxYkYZekw%3D%3D",
  //   headers: {
  //     Origin: "https://reboks.nus.edu.sg",
  //     Referer:
  //       "https://reboks.nus.edu.sg/nus_saml_provider/public/index.php/adfs/auth",
  //     "Content-Type": "application/x-www-form-urlencoded",
  //   },
  //   data: data,
  // };
  // axios(config)
  //   .then((response) => {
  //     console.log(response.headers);
  //   })
  //   .catch((error) => {
  //     console.log(error);
  //   });
};
requestTraffic();

app.listen(process.env.PORT || 5000);
