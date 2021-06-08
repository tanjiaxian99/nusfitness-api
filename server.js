const express = require("express");
const mongoose = require("mongoose");
const MongoStore = require("connect-mongo");
const User = require("./models/user");
const cors = require("cors");
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const passport = require("passport");
const jwt = require("jsonwebtoken");

require("./passport");

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

const genToken = user => {
	return jwt.sign({ user }, process.env.JWT_SECRET,  { expiresIn: 604800 });
};

const db = mongoose.connection;
db.on("error", console.error.bind(console, "connection error:"));
db.once("open", () => {
  console.log("Database connected!");
});

const app = express();

app.use(express.json());
app.use(bodyParser.json());
app.use(cookieParser(process.env.COOKIE_SECRET));

app.use(cors({ origin: true, credentials: true }));

app.use(passport.initialize());

app.get("/", (req, res) => {
  res.send("hello world!");
});

app.post("/register", async (req, res) => {
  	try {
		const { email, password } = req.body;
		const user = new User({ email });
		const newUser = await User.register(user, password);
		const token = genToken(newUser);
		console.log(token);
		res.json(newUser);
	} catch (err) {
		console.log(err);
		res.status(400).json(err);
	}
});

app.post("/login", passport.authenticate("local"), (req, res) => {
  res.status(200).json({ success: true });
  console.log("/login", req.isAuthenticated());
});

app.get("/logout", (req, res) => {
  req.logout();
  console.log(req.isAuthenticated());
  res.status(200).json({ success: true });
});

app.post("/book", (req, res) => {
  const bookingCollection = db.collection("booking");
  bookingCollection.insertOne(req.body).catch((error) => console.error(error));
  res.status(200).json({ success: true });
});

app.post("/slots", (req, res) => {
  const bookingCollection = db.collection("booking");
  const { facility, date, hour } = req.body;
  const count = bookingCollection.countDocuments(
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

app.get("/isLoggedIn", (req, res) => {
  const authenticated = req.isAuthenticated();
  res.json({ authenticated });
});

app.listen(process.env.PORT || 3000);
