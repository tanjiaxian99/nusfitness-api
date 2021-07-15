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

/**
 * @api {post} /register Insert user information
 * @apiName PostRegister
 * @apiGroup Registration/Login
 *
 * @apiParam {String} email Unique email of the user
 * @apiParam {String} password Login password of the user
 *
 * @apiSuccess {String} _id Unique id of the user in the database
 * @apiSuccess {String} email Unique email of the user
 * @apiSuccess {String} joined Join date of the user
 * @apiSuccess {String} salt Salt associated with the hashed password of the user
 * @apiSuccess {String} hash Hashed password of the user
 * @apiSuccess {Number} __v Version key of the user's document in the database
 *
 * @apiSuccessExample Success-Response:
 *     HTTP/1.1 200 Ok
 *     {
 *       "_id": "60f0015f67cd8e43b0ec0b3c",
 *       "email": "e0000000X@u.nus.edu"
 *       "joined": "2021-07-15T09:35:27.083Z",
 *       "salt": "a9038007db8f935bf78288ea8ae729336110e56866f6edb4010b3678abaf5cce",
 *       "hash": "181ea7263b1a53b828952e44d6d0bdc113a6776d48e66e8922464b41e294fd034145b6ee313a87f8f15a1956b6365fe3a07941658efcba9756976e8083fe16e2a8d9b2ae2c572cb5edefb4205e1ba20ad96460777d9ddff50d0e76482bc208fcc6acb5ee2dad55906ff41303980c0baf84287406ac5086f6902fa0f045fcd7d40d0c929ed28ce21548aca9362ce42d4af21c1662412f5e1c75a9aeb0b8af226d704db7a343e0cb5c344fe0026361314cd5f5c01a3b86224377c154500fde4c00ba192a4918ac9dd11dbaea695a670741cb80368ee5840f768c4e7257463c02215e6e8f9c956e5abd86e0e0e4fbdbdaaadd4f7f214660aa670cac6adfa27c96bd5935ab99d41827612fb622600e17234364cd090307ecad05eb5eb1af0875bb7ac508042a88152162b3cb916633f255074a5fff6d334e239b8a7a4f1229ac6bb6c9551d3958ad7aca0dc4414fd2cf5b24a724fe34e22ea19c7ede544c1cc56827882e80d1c0c6fb810acf0817c0e32e20d48956044836b4d42b8769d04fe15e9ee32f65348a066085fbdb0cc072e8fc40862eea911b26dfa8ab092f47d65da55a9bbbf40c0afd3ac7a8aeb878b4f1459d93e100be410cdf9f5d3a017db43989c411c99bccd034a798d8a09a65b28697ac2be1c333d894b840ef829d74413548d31d173bca8f9bde55f8e697dbc1009eebcab6d6b457778c7ccda537c9f94e4b7e"
 *       "__v": 0
 *     }
 *
 * @apiError UserExistsError A user with the given username is already registered
 *
 * @apiErrorExample Error-Response:
 *     HTTP/1.1 404 Bad Request
 *     {
 *       "name": "UserExistsError",
 *       "message": "A user with the given username is already registered"
 *     }
 */
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

/**
 * @api {post} /login Login with user information
 * @apiName PostLogin
 * @apiGroup Registration/Login
 *
 * @apiParam {String} email Unique email of the user
 * @apiParam {String} password Login password of the user
 *
 * @apiSuccess {Boolean} success Success of logging in
 *
 * @apiSuccessExample Success-Response:
 *     HTTP/1.1 200 Ok
 *     {
 *       "success": true
 *     }
 *
 * @apiError Unauthorized The given email and password is unauthorized to login
 *
 * @apiErrorExample Error-Response:
 *     HTTP/1.1 401 Unauthorized
 *     Unauthorized
 */
app.post("/login", passport.authenticate("local"), (req, res) => {
  res.status(200).json({ success: true });
});

/**
 * @api {get} /logout Logout the current user
 * @apiName GetLogout
 * @apiGroup Registration/Login
 *
 * @apiSuccess {Boolean} success Success of logging out
 *
 * @apiSuccessExample Success-Response:
 *     HTTP/1.1 200 Ok
 *     {
 *       "success": true
 *     }
 */
app.get("/logout", (req, res) => {
  req.logout();
  res.status(200).json({ success: true });
});

/**
 * @api {get} /isLoggedIn Users logged in status
 * @apiName GetIsLoggedIn
 * @apiGroup Registration/Login
 *
 * @apiSuccess {Boolean} authenticated Users logged in status
 *
 * @apiSuccessExample Success-Response:
 *     HTTP/1.1 200 Ok
 *     {
 *       "authenticated": true
 *     }
 */
app.get("/isLoggedIn", (req, res) => {
  const authenticated = req.isAuthenticated();
  res.json({ authenticated });
});

/**
 * @api {post} /cancel Delete booked slot
 * @apiName PostCancel
 * @apiGroup Booking
 *
 * @apiParam {String} chatId Users Telegram ChatId
 * @apiParam {String} facility Facility of the slot that is going to be cancelled
 * @apiParam {String} date Date of the slot
 *
 * @apiSuccess {Boolean} success Success of cancelling the slot
 *
 * @apiSuccessExample Success-Response:
 *     HTTP/1.1 200 Ok
 *     {
 *       "success": true
 *     }
 *
 * @apiError Unauthorized The given email and password is unauthorized to login
 *
 * @apiErrorExample Error-Response:
 *     HTTP/1.1 401 Unauthorized
 *     {
 *       "success": false
 *     }
 *
 * @apiError TimeElapsed The slot's time is within the 2 hours cancellation window and cannot be cancelled
 *
 * @apiErrorExample Error-Response:
 *     HTTP/1.1 403 Forbidden
 *     {
 *       "success": false
 *     }
 *
 * @apiError DocumentNotFound The slot to be cancelled cannot be found
 *
 * @apiErrorExample Error-Response:
 *     HTTP/1.1 404 Not Found
 *     {
 *       "success": false
 *     }
 */
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

/**
 * @api {post} /book Book slot
 * @apiName PostBook
 * @apiGroup Booking
 *
 * @apiParam {String} chatId Users Telegram ChatId
 * @apiParam {String} facility Facility of the slot that is going to be booked
 * @apiParam {String} date Date of the slot
 *
 * @apiSuccess {Boolean} success Success of cancelling the slot
 *
 * @apiSuccessExample Success-Response:
 *     HTTP/1.1 200 Ok
 *     {
 *       "success": true
 *     }
 *
 * @apiError Unauthorized The given email and password is unauthorized to login
 *
 * @apiErrorExample Error-Response:
 *     HTTP/1.1 401 Unauthorized
 *     {
 *       "success": false
 *     }
 *
 * @apiError SlotFull The slot has reached maximum capacity and cannot be booked
 *
 * @apiErrorExample Error-Response:
 *     HTTP/1.1 403 Forbidden
 *     {
 *       "success": false
 *     }
 *
 * @apiError MongoError Error raised by MongoDB
 *
 * @apiErrorExample Error-Response:
 *     HTTP/1.1 404 Not Found
 *     {
 *       "name": "MongoError",
 *       "err": "E11000 duplicate key error index: test.test.$country_1  dup key: { : \"XYZ\" }",
 *       "code": 11000,
 *       "n": 0,
 *       "connectionId":10706,
 *       "ok":1
 *     }
 */
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
      res.status(403).json({ success: false });
    } else {
      const booking = { email, facility, date };
      bookingCollection.insertOne(booking, (error, result) => {
        if (error) {
          console.log(error);
          res.status(404).json(error);
        } else {
          res.status(200).json({ success: true });
        }
      });
    }
  }
});

/**
 * @api {post} /slots Number of booked slots
 * @apiName PostSlots
 * @apiGroup Booking
 *
 * @apiParam {String} facility Facility of the slots
 * @apiParam {String} startDate The start date to start searching for the slots
 * @apiParam {String} endDate The end date to stop searching for the slots
 *
 * @apiSuccess {Object[]} slots Array of slots
 *
 * @apiSuccessExample Success-Response:
 *     HTTP/1.1 200 Ok
 *     [
 *       {
 *         "_id": "2021-07-09T08:00:00.000Z",
 *         "count": 1
 *       },
 *       {
 *         "_id": "2021-07-05T23:30:00.000Z",
 *         "count": 2
 *       },
 *       {
 *         "_id": "2021-07-08T05:00:00.000Z",
 *         "count": 4
 *       },
 *     ]
 *
 * @apiError CollectionNotAggregated The slots cannot be aggregated
 *
 * @apiErrorExample Error-Response:
 *     HTTP/1.1 404 Not Found
 *     {
 *       "name": "MongoError",
 *       "err": "E11000 duplicate key error index: test.test.$country_1  dup key: { : \"XYZ\" }",
 *       "code": 11000,
 *       "n": 0,
 *       "connectionId":10706,
 *       "ok":1
 *     }
 */
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
    res.status(404).json(err);
  }
});

/**
 * @api {post} /bookedSlots Users booked slots
 * @apiName PostBookedSlots
 * @apiGroup Booking
 *
 * @apiParam {String} chatId Users Telegram ChatId
 * @apiParam {String} facility Facility of the booked slots
 *
 * @apiSuccess {Object[]} slots Array of slots
 *
 * @apiSuccessExample Success-Response:
 *     HTTP/1.1 200 Ok
 *     [
 *       {
 *         "_id": "60e1e713f72ceb4b84061666",
 *         "email": "e0000000X@u.nus.edu",
 *         "facility": "Kent Ridge Swimming Pool",
 *         "date": "2021-07-05T23:30:00.000Z"
 *       },
 *       {
 *         "_id": "60e495cb14d4dc01fcc2e767",
 *         "email": "e0000000X@u.nus.edu",
 *         "facility": "University Town Gym",
 *         "date": "2021-07-08T03:00:00.000Z"
 *       },
 *       {
 *         "_id": "60e542cf1c7c7a2540ad0e57",
 *         "email": "e0000000X@u.nus.edu",
 *         "facility": "University Sports Centre Gym",
 *         "date": "2021-07-09T08:00:00.000Z"
 *       }
 *     ]
 * @apiError Unauthorized The given email and password is unauthorized to login
 *
 * @apiErrorExample Error-Response:
 *     HTTP/1.1 401 Unauthorized
 *     {
 *       "success": false
 *     }
 *
 * @apiError MongoError Error raised by MongoDB
 *
 * @apiErrorExample Error-Response:
 *     HTTP/1.1 404 Not Found
 *     {
 *       "name": "MongoError",
 *       "err": "E11000 duplicate key error index: test.test.$country_1  dup key: { : \"XYZ\" }",
 *       "code": 11000,
 *       "n": 0,
 *       "connectionId":10706,
 *       "ok":1
 *     }
 */
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
              res.status(404).json(error);
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
              res.status(404).json(error);
            }
          });
  }
});

/**
 * @api {post} /traffic Historical traffic
 * @apiName PostTraffic
 * @apiGroup Traffic
 *
 * @apiParam {Number} facility Number associated with selected facility
 * @apiParam {Object} dateFilter Date range to filter by
 * @apiParam {Number[]} dayFilter Days to filter by
 *
 * @apiSuccess {Object[]} slots Array of slots
 *
 * @apiSuccessExample Success-Response:
 *     HTTP/1.1 200 Ok
 *     [
 *       {
 *         "_id": {
 *           "hour": "17",
 *           "minute": "40"
 *         },
 *         "date": "2021-07-15T09:40:00.000Z",
 *         "count": 33
 *       },
 *       {
 *         "_id": {
 *           "hour": "17",
 *           "minute": "45"
 *         },
 *         "date": "2021-07-15T09:45:00.000Z",
 *         "count": 35
 *       },
 *       {
 *         "_id": {
 *           "hour": "17",
 *           "minute": "50"
 *         },
 *       "date": "2021-07-15T09:50:00.000Z",
 *       "count": 34
 *       },
 *     ]
 *
 * @apiError MongoError Error raised by MongoDB
 *
 * @apiErrorExample Error-Response:
 *     HTTP/1.1 404 Not Found
 *     {
 *       "name": "MongoError",
 *       "err": "E11000 duplicate key error index: test.test.$country_1  dup key: { : \"XYZ\" }",
 *       "code": 11000,
 *       "n": 0,
 *       "connectionId":10706,
 *       "ok":1
 *     }
 */
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
    res.status(404).json(err);
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
