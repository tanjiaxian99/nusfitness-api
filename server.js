const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const User = require("./models/user");
const cors = require("cors");

require("dotenv").config();
const uri = process.env.MONGODB_URI;

// Database
mongoose.connect("mongodb://localhost:27017/nusfitness", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  useCreateIndex: true,
  useFindAndModify: false,
});

// mongoose.connect(uri, {
// 	useNewUrlParser: true,
// 	useUnifiedTopology: true,
// 	useCreateIndex: true,
// 	useFindAndModify: false
// })

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
  console.log(req.isAuthenticated());
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

app.listen(process.env.PORT || 3000);
