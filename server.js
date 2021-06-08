const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const User = require("./models/user");
const cors = require("cors");
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const JwtStrategy = require("passport-jwt").Strategy;
const ExtractJwt = require("passport-jwt").ExtractJwt;
const jwt = require("jsonwebtoken");

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

app.use(bodyParser.json());
app.use(cookieParser(process.env.COOKIE_SECRET));

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

// Session
// const sessionConfig = {
//   secret: "secret",
//   resave: false,
//   saveUninitialized: false,
//   store: MongoStore.create({
//     mongoUrl: "mongodb://localhost:27017/nusfitness",
//     collectionName: "sessions",
//   }),
//   cookie: {
//     secure: false,
//     maxAge: 30 * 1000 * 60 * 60 * 24,
//   },
// };

// app.use(session(sessionConfig));

// Jwt Stuff
const opts = {}
opts.jwtFromRequest = ExtractJwt.fromAuthHeaderAsBearerToken();
opts.secretOrKey = process.env.JWT_SECRET;

passport.use(new JwtStrategy(opts, function(jwt_payload, done) {
    User.findOne({id: jwt_payload.sub}, function(err, user) {
        if (err) {
            return done(err, false);
        }
        if (user) {
            return done(null, user);
        } else {
            return done(null, false);
        }
    });
}));

const COOKIE_OPTIONS = {
	httpOnly: true,
	// Since localhost is not having https protocol,
	// secure cookies do not work correctly (in postman)
	secure: !dev,
	signed: true,
	maxAge: eval(process.env.REFRESH_TOKEN_EXPIRY) * 1000,
	sameSite: "none",
};

const getToken = user => {
	return jwt.sign(user, process.env.JWT_SECRET, {
		expiresIn: eval(process.env.SESSION_EXPIRY),
	})
};

const getRefreshToken = user => {
	return jwt.sign(user, process.env.REFRESH_TOKEN_SECRET, {
		expiresIn: eval(process.env.REFRESH_TOKEN_EXPIRY),
	});
};

const verifyUser = passport.authenticate("jwt", { session: false });

passport.use(
	new LocalStrategy({ usernameField: "email" }, User.authenticate())
  );
  
passport.serializeUser(User.serializeUser());

// Passport.js
app.use(passport.initialize());
// app.use(passport.session());

app.get("/", (req, res) => {
  res.send("hello world!");
});

app.post("/register", (req, res) => {
  	try {
		const { email, password } = req.body;
		const user = new User({ email });
		User.register(user, password, (err, user) => {
			if (err) {
				res.statusCode = 500;
				res.send(err);
			} else {
				const token = getToken({ _id: user._id });
				const refreshToken = getRefreshToken({ _id: user._id });
				user.refreshToken.push({ refreshToken });
				user.save((err, user) => {
					if (err) {
						res.statusCode = 500;
						res.send(err);
					} else {
						res.cookie("refreshToken", refreshToken, COOKIE_OPTIONS);
						res.send({ success: true, token });
					}
				})
			}	
		});
	} catch (err) {
		res.statusCode = 500;
		res.send(err);
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
