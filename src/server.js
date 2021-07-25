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
const wakeUpDyno = require("./wokeDyno.js");

require("dotenv").config();

const uri =
  process.env.NODE_ENV === "development"
    ? "mongodb://localhost:27017/nusfitness"
    : "process.env.MONGODB_URI";

mongoose.connect(uri, {
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
    mongoUrl: uri,
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
const getEmail = async (req) => {
  try {
    if (req.isAuthenticated()) {
      return req.user.email;
    } else {
      const users = db.collection("users");
      const chatId = parseInt(req.body.chatId);
      const user = await users.findOne({ chatId });
      return user.email;
    }
  } catch (err) {
    return undefined;
  }
};

/** ROUTES */

app.use("/telegram", telegram);

app.get("/", (req, res) => {
  res.send("hello world!");
});

/**
 * @apiDefine UnauthorizedError
 *
 * @apiError Unauthorized The given email and password is unauthorized to login
 *
 * @apiErrorExample Error-Response:
 *     HTTP/1.1 401 Unauthorized
 *     {
 *       "success": false
 *     }
 */

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
 *     HTTP/1.1 400 Bad Request
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

    const creditsCollection = db.collection("credits");
    await creditsCollection.insertOne({ email, credits: 6 });
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
 * @api {post} /book Book slot
 * @apiName PostBook
 * @apiGroup Booking
 *
 * @apiParam {Number} chatId Users Telegram ChatId
 * @apiParam {String} facility Facility of the slot that is going to be booked
 * @apiParam {Object} date Date of the slot
 *
 * @apiSuccess {Object} success Success status of booking the slot
 *
 * @apiSuccessExample Success-Response:
 *     HTTP/1.1 200 Ok
 *     {
 *       "success": true
 *     }
 *
 * @apiError MongoError Error raised by MongoDB
 *
 * @apiErrorExample Error-Response:
 *     HTTP/1.1 400 Bad Request
 *     {
 *       "name": "MongoError",
 *       "err": "E11000 duplicate key error index: test.test.$country_1  dup key: { : \"XYZ\" }",
 *       "code": 11000,
 *       "n": 0,
 *       "connectionId":10706,
 *       "ok":1
 *     }
 *
 * @apiUse UnauthorizedError
 *
 * @apiError SlotFull The slot has reached maximum capacity and cannot be booked
 *
 * @apiErrorExample Error-Response:
 *     HTTP/1.1 403 Forbidden
 *     {
 *       "success": false
 *     }
 */
app.post("/book", async (req, res) => {
  if (!req.isAuthenticated() && !req.body.chatId) {
    res.status(401).json({ success: false });
    return;
  }

  try {
    const bookingCollection = db.collection("booking");
    const facility = req.body.facility;
    const date = new Date(req.body.date);
    const maxCapacity = 40;
    const email = await getEmail(req);

    // Make sure count does not exceed max capacity in the event of multiple bookings
    const count = await bookingCollection.countDocuments({
      facility,
      date,
    });

    if (count >= maxCapacity) {
      res.status(403).json({ success: false });
      return;
    }

    const booking = { email, facility, date };
    await bookingCollection.insertOne(booking);
    res.status(200).json({ success: true });
  } catch (err) {
    console.log(err);
    res.status(400).json(err);
  }
});

/**
 * @api {post} /cancel Delete booked slot
 * @apiName PostCancel
 * @apiGroup Booking
 *
 * @apiParam {Number} chatId Users Telegram ChatId
 * @apiParam {String} facility Facility of the slot that is going to be cancelled
 * @apiParam {Object} date Date of the slot
 *
 * @apiSuccess {Object} success Success status of cancelling the slot
 *
 * @apiSuccessExample Success-Response:
 *     HTTP/1.1 200 Ok
 *     {
 *       "success": true
 *     }
 *
 * @apiError MongoError Error raised by MongoDB
 *
 * @apiErrorExample Error-Response:
 *     HTTP/1.1 400 Bad Request
 *     {
 *       "name": "MongoError",
 *       "err": "E11000 duplicate key error index: test.test.$country_1  dup key: { : \"XYZ\" }",
 *       "code": 11000,
 *       "n": 0,
 *       "connectionId":10706,
 *       "ok":1
 *     }
 *
 * @apiUse UnauthorizedError
 *
 * @apiError TimeElapsed The slot's time is within the 2 hours cancellation window and cannot be cancelled
 *
 * @apiErrorExample Error-Response:
 *     HTTP/1.1 403 Forbidden
 *     {
 *       "success": false
 *     }
 */
app.post("/cancel", async (req, res) => {
  if (!req.isAuthenticated() && !req.body.chatId) {
    res.status(401).json({ success: false });
    return;
  }
  try {
    const email = await getEmail(req);
    const facility = req.body.facility;
    const date = new Date(req.body.date);

    // Unable to cancel slot if it is 2 hours before the actual slot
    const slotTime = dateFns.addHours(date, -2);
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
      res.status(400).json({ success: false });
    } else {
      res.status(200).json({ success: true });
    }
  } catch (err) {
    console.log(err);
    res.status(400).json(err);
  }
});

/**
 * @api {post} /slots Number of booked slots
 * @apiName PostSlots
 * @apiGroup Booking
 *
 * @apiParam {String} facility Facility of the slots
 * @apiParam {Object} startDate The start date to start searching for the slots
 * @apiParam {Object} endDate The end date to stop searching for the slots
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
 * @apiError MongoError Error raised by MongoDB
 *
 * @apiErrorExample Error-Response:
 *     HTTP/1.1 400 Bad Request
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
  try {
    const bookingCollection = db.collection("booking");
    const now = new Date();
    const facility = req.body.facility;
    const startDate = new Date(req.body.startDate);
    const endDate = req.body.endDate
      ? new Date(req.body.endDate)
      : new Date(dateFns.addDays(startDate, 1));

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
    console.log(err);
    res.status(400).json(err);
  }
});

/**
 * @api {post} /bookedSlots Users booked slots
 * @apiName PostBookedSlots
 * @apiGroup Booking
 *
 * @apiParam {Number} chatId Users Telegram ChatId
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
 *
 * @apiError MongoError Error raised by MongoDB
 *
 * @apiErrorExample Error-Response:
 *     HTTP/1.1 400 Bad Request
 *     {
 *       "name": "MongoError",
 *       "err": "E11000 duplicate key error index: test.test.$country_1  dup key: { : \"XYZ\" }",
 *       "code": 11000,
 *       "n": 0,
 *       "connectionId":10706,
 *       "ok":1
 *     }
 *
 * @apiUse UnauthorizedError
 */
app.post("/bookedSlots", async (req, res) => {
  if (!req.isAuthenticated() && !req.body.chatId) {
    res.status(401).json({ success: false });
    return;
  }

  try {
    const email = await getEmail(req);
    const facility = req.body.facility;
    const bookingCollection = db.collection("booking");

    if (facility) {
      const result = await bookingCollection
        .find({
          email,
          facility,
        })
        .toArray();
      res.json(result);
    } else {
      const result = await bookingCollection
        .find(
          {
            email,
          },
          { sort: [["date", -1]] }
        )
        .toArray();
      res.json(result);
    }
  } catch (err) {
    console.log(err);
    res.status(400).json(err);
  }
});

/**
 * @api {get} /creditsLeft Users credit count
 * @apiName GetBookedSlots
 * @apiGroup Booking
 *
 * @apiParam {Number} chatId Users Telegram ChatId
 *
 * @apiSuccess {Object} credits Number of credits left
 *
 * @apiSuccessExample Success-Response:
 *     HTTP/1.1 200 Ok
 *     {
 *         credits: 6
 *     }
 *
 * @apiError MongoError Error raised by MongoDB
 *
 * @apiErrorExample Error-Response:
 *     HTTP/1.1 400 Bad Request
 *     {
 *       "name": "MongoError",
 *       "err": "E11000 duplicate key error index: test.test.$country_1  dup key: { : \"XYZ\" }",
 *       "code": 11000,
 *       "n": 0,
 *       "connectionId":10706,
 *       "ok":1
 *     }
 *
 * @apiUse UnauthorizedError
 */
app.post("/creditsLeft", async (req, res) => {
  if (!req.isAuthenticated() && !req.body.chatId) {
    res.status(401).json({ success: false });
    return;
  }

  try {
    const email = await getEmail(req);
    const creditCollection = db.collection("credits");
    const user = await creditCollection.findOne({ email });
    res.json({ credits: user.credits });
  } catch (err) {
    console.log(err);
    res.status(400).json(err);
  }
});

/**
 * @api {post} /updateCredits Decrement users credit count
 * @apiName PostUpdateCredits
 * @apiGroup Booking
 *
 * @apiParam {Number} chatId Users Telegram ChatId
 *
 * @apiSuccess {Object} success Success status of decrementing users credit count
 *
 * @apiSuccessExample Success-Response:
 *     HTTP/1.1 200 Ok
 *     {
 *         success: true
 *     }
 *
 * @apiError MongoError Error raised by MongoDB
 *
 * @apiErrorExample Error-Response:
 *     HTTP/1.1 400 Bad Request
 *     {
 *       "name": "MongoError",
 *       "err": "E11000 duplicate key error index: test.test.$country_1  dup key: { : \"XYZ\" }",
 *       "code": 11000,
 *       "n": 0,
 *       "connectionId":10706,
 *       "ok":1
 *     }
 *
 * @apiError NoMoreCredits User has ran out of credits
 *
 * @apiErrorExample Error-Response:
 *     HTTP/1.1 400 Bad Request
 *     {
 *         success: false
 *     }
 *
 * @apiUse UnauthorizedError
 */
app.post("/updateCredits", async (req, res) => {
  if (!req.isAuthenticated() && !req.body.chatId) {
    res.status(401).json({ success: false });
    return;
  }

  try {
    const email = await getEmail(req);
    const creditCollection = db.collection("credits");

    // Unable to deduct credit if the user does not have any left
    const user = await creditCollection.findOne({ email });
    if (user.credits <= 0) {
      res.status(400).json({ success: false });
      return;
    }

    await creditCollection.updateOne(
      { email },
      {
        $inc: { credits: -1 },
      }
    );
    res.json({ success: true });
  } catch (err) {
    console.log(err);
    res.status(400).json(err);
  }
});

/**
 * @api {post} /traffic Historical traffic
 * @apiName PostTraffic
 * @apiGroup Traffic
 *
 * @apiParam {Number} facility Number associated with selected facility
 * @apiParam {Object} date Date range to filter by
 * @apiParam {Number[]} day Days to filter by
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
 *     HTTP/1.1 400 Bad Request
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
  try {
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

/** AUTOMATED UPDATES TO DATABASE */

// Updates credit collection every Sunday
const updateCreditsCollection = async () => {
  let now = new Date();
  if (now.getDay == 0) {
    try {
      const creditsCollection = db.collection("credits");
      await creditsCollection.updateMany(
        {},
        {
          $set: { credits: 6 },
        }
      );
    } catch {
      console.log(err);
    }
  }

  // Set delay for next request
  now = new Date();
  const msInADay = 1000 * 60 * 60 * 24;
  const delay = msInADay - (now % msInADay);
  setTimeout(updateCreditsCollection, delay);
};
updateCreditsCollection();

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
    try {
      const traffic = await requestTraffic();
      const trafficCollection = db.collection("traffic");
      await trafficCollection.insertOne({ date, traffic });
    } catch {
      console.log(err);
    }
  }

  // Set delay for next request
  now = new Date();
  const delay = 300000 - (now % 300000);
  setTimeout(updateTrafficCollection, delay);
};
updateTrafficCollection();

app.listen(process.env.PORT || 5000, () =>
  wakeUpDyno("https://salty-reaches-24995.herokuapp.com/")
);
