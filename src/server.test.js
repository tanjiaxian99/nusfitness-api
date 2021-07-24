const chai = require("chai");
const chaiHttp = require("chai-http");
const expect = chai.expect;
chai.use(chaiHttp);
const server = "http://local.nusfitness.com:5000";
const mongoose = require("mongoose");

describe("Backend Tests", () => {
  let usersCollection;
  let bookingsCollection;
  let trafficCollection;
  let telegramSessionsCollection;
  let creditsCollection;
  const existingUser1 = { email: "1@test.com", password: "1" };
  const existingUser2 = { email: "2@test.com", password: "2" };
  const existingUser1Telegram = {
    name: "test1",
    chatId: 1001,
  };
  const existingUser2Telegram = {
    name: "test2",
    chatId: 1002,
  };

  before(async () => {
    // Localhost
    mongoose.connect("mongodb://localhost:27017/nusfitness", {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      useCreateIndex: true,
      useFindAndModify: false,
    });

    const db = mongoose.connection;
    usersCollection = db.collection("users");
    bookingsCollection = db.collection("booking");
    trafficCollection = db.collection("traffic");
    telegramSessionsCollection = db.collection("telegram-sessions");
    creditsCollection = db.collection("credits");

    await chai.request(server).post("/register").send(existingUser1);
    await chai.request(server).post("/register").send(existingUser2);
  });

  describe("Registration/Login", () => {
    describe("POST /register", () => {
      const user = {
        email: "e0000000X@u.nus.edu",
        password: "123",
      };

      it("should POST a user's email and password and register the user", async () => {
        const res = await chai.request(server).post("/register").send(user);

        expect(res).to.have.status(200);
        expect(res.body).to.be.a("Object");
        expect(res.body).to.have.property("_id");
        expect(res.body).to.have.property("email");
        expect(res.body).to.have.property("joined");
        expect(res.body).to.have.property("salt");
        expect(res.body).to.have.property("hash");
        expect(res.body).to.have.property("__v");
        expect(res).to.have.cookie("connect.sid");
      });

      it("should not POST if the user already exists", async () => {
        let res = await chai.request(server).post("/register").send(user);
        res = await chai.request(server).post("/register").send(user);
        expect(res).to.have.status(400);
        expect(res.body).to.be.a("Object");
        expect(res.body).to.have.property("name").eql("UserExistsError");
        expect(res.body)
          .to.have.property("message")
          .eql("A user with the given username is already registered");
      });

      afterEach(async () => {
        await usersCollection.deleteOne({ email: "e0000000X@u.nus.edu" });
      });
    });

    describe("POST /login", () => {
      const nonExistingUser = {
        email: "e0000000X@u.nus.edu",
        password: "123",
      };

      const existingUserWrongPassword = {
        email: "1@test.com",
        password: "2",
      };

      it("should POST a user's email and password and login", async () => {
        const res = await chai
          .request(server)
          .post("/login")
          .send(existingUser1);

        expect(res).to.have.status(200);
        expect(res.body).to.be.a("Object");
        expect(res.body).to.have.property("success").eql(true);
        expect(res).to.have.cookie("connect.sid");
      });

      it("should not POST if they do not have an account", async () => {
        const res = await chai
          .request(server)
          .post("/login")
          .send(nonExistingUser);

        expect(res).to.have.status(401);
      });

      it("should not POST if the password is wrong", async () => {
        const res = await chai
          .request(server)
          .post("/login")
          .send(existingUserWrongPassword);

        expect(res).to.have.status(401);
      });
    });

    describe("GET /isLoggedIn", async () => {
      const nonExistingUser = {
        email: "e0000000X@u.nus.edu",
        password: "123",
      };

      let agent;

      beforeEach(() => {
        agent = chai.request.agent(server);
      });

      it("should GET login status if user is logged in", async () => {
        await agent.post("/login").send(existingUser1);

        const res = await agent.get("/isLoggedIn").send(existingUser1);

        expect(res).to.have.status(200);
        expect(res.body).to.be.a("Object");
        expect(res.body).to.have.property("authenticated").eql(true);
      });

      it("should GET login status if user is not logged in", async () => {
        const res = await agent.get("/isLoggedIn").send(existingUser1);

        expect(res).to.have.status(200);
        expect(res.body).to.be.a("Object");
        expect(res.body).to.have.property("authenticated").eql(false);
      });

      it("should GET login status if user does not have an account", async () => {
        await agent.post("/login").send(nonExistingUser);

        const res = await agent.get("/isLoggedIn").send(nonExistingUser);

        expect(res).to.have.status(200);
        expect(res.body).to.be.a("Object");
        expect(res.body).to.have.property("authenticated").eql(false);
      });

      afterEach(() => {
        agent.close();
      });
    });
  });

  describe("Booking", () => {
    describe("POST /book", () => {
      const booking = {
        facility: "Wellness Outreach Gym",
        date: new Date(2021, 6, 17, 14, 00, 00, 00),
      };

      const bookingTelegram = {
        chatId: 1001,
        facility: "Wellness Outreach Gym",
        date: new Date(2021, 6, 17, 14, 00, 00, 00),
      };

      let agent;

      beforeEach(() => {
        agent = chai.request.agent(server);
      });

      it("should POST booking details if user is logged in on the website and slot can be booked", async () => {
        await agent.post("/login").send(existingUser1);
        const res = await agent.post("/book").send(booking);

        expect(res).to.have.status(200);
        expect(res.body).to.be.a("Object");
        expect(res.body).to.have.property("success").eql(true);
      });

      it("should POST booking details if user is logged in on Telegram and slot can be booked", async () => {
        await agent.post("/login").send(existingUser1);
        await agent.post("/telegram/login").send(existingUser1Telegram);
        const res = await chai
          .request(server)
          .post("/book")
          .send(bookingTelegram);

        expect(res).to.have.status(200);
        expect(res.body).to.be.a("Object");
        expect(res.body).to.have.property("success").eql(true);
      });

      it("should not POST booking details if user is not logged in on the website or Telegram", async () => {
        const res = await agent.post("/book").send(booking);

        expect(res).to.have.status(401);
        expect(res.body).to.be.a("Object");
        expect(res.body).to.have.property("success").eql(false);
      });

      it("should not POST booking details if the slot is full", async () => {
        const bookingArray = [];
        for (let i = 0; i < 20; i++) {
          bookingArray.push({ ...booking });
        }
        bookingsCollection.insertMany(bookingArray);

        await agent.post("/login").send(existingUser1);
        const res = await agent.post("/book").send(booking);

        expect(res).to.have.status(403);
        expect(res.body).to.be.a("Object");
        expect(res.body).to.have.property("success").eql(false);
      });

      afterEach(async () => {
        await usersCollection.updateOne(
          { email: "1@test.com" },
          { $unset: { chatId: "" } }
        );
        await bookingsCollection.deleteMany(booking);
        agent.close();
      });
    });

    describe("POST /cancel", () => {
      const booking = {
        facility: "Wellness Outreach Gym",
        date: new Date(2050, 6, 17, 14, 00, 00, 00),
      };

      const bookingTelegram = {
        chatId: 1001,
        facility: "Wellness Outreach Gym",
        date: new Date(2050, 6, 17, 14, 00, 00, 00),
      };

      const date = new Date();
      date.setHours(date.getHours() + 1, 0, 0, 0);
      const bookingWithin2HourWindow = {
        facility: "Wellness Outreach Gym",
        date,
      };

      let agent;

      beforeEach(() => {
        agent = chai.request.agent(server);
      });

      it("should POST cancel details if user is logged in on the website and slot can be cancelled", async () => {
        await agent.post("/login").send(existingUser1);
        await agent.post("/book").send(booking);
        const res = await agent.post("/cancel").send(booking);

        expect(res).to.have.status(200);
        expect(res.body).to.be.a("Object");
        expect(res.body).to.have.property("success").eql(true);
      });

      it("should POST booking details if user is logged in on Telegram and slot can be booked", async () => {
        await agent.post("/login").send(existingUser1);
        await agent.post("/telegram/login").send(existingUser1Telegram);
        await chai.request(server).post("/book").send(bookingTelegram);
        const res = await agent.post("/cancel").send(bookingTelegram);

        expect(res).to.have.status(200);
        expect(res.body).to.be.a("Object");
        expect(res.body).to.have.property("success").eql(true);
      });

      it("should not POST booking details if user is not logged in on the website or Telegram", async () => {
        await agent.post("/login").send(existingUser1);
        await agent.post("/book").send(booking);
        await agent.get("/logout");
        const res = await agent.post("/cancel").send(booking);

        expect(res).to.have.status(401);
        expect(res.body).to.be.a("Object");
        expect(res.body).to.have.property("success").eql(false);
      });

      it("should not POST booking details if the slot is within the 2-hour cancellation window", async () => {
        await agent.post("/login").send(existingUser1);
        await agent.post("/book").send(bookingWithin2HourWindow);
        const res = await agent.post("/cancel").send(bookingWithin2HourWindow);

        expect(res).to.have.status(403);
        expect(res.body).to.be.a("Object");
        expect(res.body).to.have.property("success").eql(false);
      });

      afterEach(async () => {
        await usersCollection.updateOne(
          { email: "1@test.com" },
          { $unset: { chatId: "" } }
        );
        await bookingsCollection.deleteMany(booking);
        await bookingsCollection.deleteMany(bookingWithin2HourWindow);
        agent.close();
      });
    });

    describe("POST /slots", () => {
      const bookingArray = [
        {
          facility: "Wellness Outreach Gym",
          date: new Date(2050, 6, 17, 14, 00, 00, 00),
        },
        {
          facility: "Wellness Outreach Gym",
          date: new Date(2050, 6, 19, 15, 00, 00, 00),
        },
        {
          facility: "Wellness Outreach Gym",
          date: new Date(2050, 8, 17, 15, 00, 00, 00),
        },
        {
          facility: "University Town Swimming Pool",
          date: new Date(2050, 6, 17, 14, 00, 00, 00),
        },
      ];

      let agent;

      beforeEach(() => {
        agent = chai.request.agent(server);
      });

      it("should POST facility, startDate endDate and return a filled array", async () => {
        await agent.post("/login").send(existingUser1);
        for (let i = 0; i < 4; i++) {
          await agent.post("/book").send(bookingArray[i]);
        }
        const res = await agent.post("/slots").send({
          facility: "Wellness Outreach Gym",
          startDate: new Date(2050, 6, 17),
          endDate: new Date(2050, 6, 20),
        });

        expect(res).to.have.status(200);
        expect(res.body).to.be.a("Array");
        expect(res.body.length).to.be.eql(2);
        expect(res.body[0]).to.have.property("_id");
        expect(res.body[0]).to.have.property("count");
      });

      it("should POST facility and startDate and return a filled array", async () => {
        await agent.post("/login").send(existingUser1);
        for (let i = 0; i < 4; i++) {
          await agent.post("/book").send(bookingArray[i]);
        }
        const res = await agent.post("/slots").send({
          facility: "Wellness Outreach Gym",
          startDate: new Date(2050, 6, 17),
        });

        expect(res).to.have.status(200);
        expect(res.body).to.be.a("Array");
        expect(res.body.length).to.be.eql(1);
        expect(res.body[0]).to.have.property("_id");
        expect(res.body[0]).to.have.property("count");
      });

      it("should POST facility and startDate and return a filled array for bookings made by different users", async () => {
        await agent.post("/login").send(existingUser1);
        await agent.post("/book").send({ ...bookingArray[0] });
        await agent.get("/logout");
        await agent.post("/login").send(existingUser2);
        await agent.post("/book").send({ ...bookingArray[0] });
        const res = await agent.post("/slots").send({
          facility: "Wellness Outreach Gym",
          startDate: new Date(2050, 6, 17),
        });

        expect(res).to.have.status(200);
        expect(res.body).to.be.a("Array");
        expect(res.body.length).to.be.eql(1);
        expect(res.body[0]).to.have.property("_id");
        expect(res.body[0]).to.have.property("count").eql(2);
      });

      afterEach(async () => {
        await usersCollection.updateOne(
          { email: "1@test.com" },
          { $unset: { chatId: "" } }
        );
        await bookingsCollection.deleteMany({
          date: { $gte: new Date(2050, 0, 1) },
        });
        agent.close();
      });
    });

    describe("POST /bookedSlots", () => {
      const userTelegram1 = {
        name: "test1",
        chatId: 1001,
      };

      const userTelegram2 = {
        name: "test2",
        chatId: 1002,
      };

      const booking1ForUser1 = {
        facility: "Wellness Outreach Gym",
        date: new Date(2021, 6, 17, 14, 00, 00, 00),
      };

      const booking1ForUser2 = {
        facility: "University Town Swimming Pool",
        date: new Date(2030, 6, 5, 8, 00, 00, 00),
      };

      const booking2ForUser2 = {
        facility: "University Town Gym",
        date: new Date(2030, 6, 5, 8, 00, 00, 00),
      };

      let agent;

      beforeEach(() => {
        agent = chai.request.agent(server);
      });

      it("should POST facility if user is logged in on the website and there are booked slots of the chosen facility", async () => {
        await agent.post("/login").send(existingUser1);
        await agent.post("/book").send(booking1ForUser1);
        await agent.get("/logout");
        await agent.post("/login").send(existingUser2);
        await agent.post("/book").send(booking1ForUser2);
        const res = await agent
          .post("/bookedSlots")
          .send({ facility: "University Town Swimming Pool" });

        expect(res).to.have.status(200);
        expect(res.body).to.be.a("Array");
        expect(res.body.length).to.be.eql(1);
        expect(res.body[0]).to.have.property("_id");
        expect(res.body[0]).to.have.property("email");
        expect(res.body[0]).to.have.property("facility");
        expect(res.body[0]).to.have.property("date");
      });

      it("should POST facility if user is logged in on the website and there are no booked slots of the chosen facility", async () => {
        await agent.post("/login").send(existingUser1);
        await agent.post("/book").send(booking1ForUser1);
        await agent.get("/logout");
        await agent.post("/login").send(existingUser2);
        await agent.post("/book").send(booking1ForUser2);
        const res = await agent
          .post("/bookedSlots")
          .send({ facility: "Wellness Outreach Gym" });

        expect(res).to.have.status(200);
        expect(res.body).to.be.a("Array");
        expect(res.body.length).to.be.eql(0);
      });

      it("should POST facility if user is logged in on Telegram and there are booked slots of the chosen facility", async () => {
        await agent.post("/login").send(existingUser1);
        await agent.post("/telegram/login").send(userTelegram1);
        await agent.post("/book").send(booking1ForUser1);
        await agent.get("/logout");
        await agent.post("/login").send(existingUser2);
        await agent.post("/telegram/login").send(userTelegram2);
        await agent.post("/book").send(booking1ForUser2);
        const res = await agent
          .post("/bookedSlots")
          .send({ chatId: 1002, facility: "University Town Swimming Pool" });

        expect(res).to.have.status(200);
        expect(res.body).to.be.a("Array");
        expect(res.body.length).to.be.eql(1);
        expect(res.body[0]).to.have.property("_id");
        expect(res.body[0]).to.have.property("email");
        expect(res.body[0]).to.have.property("facility");
        expect(res.body[0]).to.have.property("date");
      });

      it("should POST facility if user is logged in on Telegram and there are no booked slots of the chosen facility", async () => {
        await agent.post("/login").send(existingUser1);
        await agent.post("/telegram/login").send(userTelegram1);
        await agent.post("/book").send(booking1ForUser1);
        await agent.get("/logout");
        await agent.post("/login").send(existingUser2);
        await agent.post("/telegram/login").send(userTelegram2);
        await agent.post("/book").send(booking1ForUser2);
        const res = await agent
          .post("/bookedSlots")
          .send({ chatId: 1002, facility: "Wellness Outreach Gym" });

        expect(res).to.have.status(200);
        expect(res.body).to.be.a("Array");
        expect(res.body.length).to.be.eql(0);
      });

      it("should POST if no facility is given", async () => {
        await agent.post("/login").send(existingUser1);
        await agent.post("/book").send(booking1ForUser1);
        await agent.get("/logout");
        await agent.post("/login").send(existingUser2);
        await agent.post("/book").send(booking1ForUser2);
        await agent.post("/book").send(booking2ForUser2);
        const res = await agent.post("/bookedSlots");

        expect(res).to.have.status(200);
        expect(res.body).to.be.a("Array");
        expect(res.body.length).to.be.eql(2);
        expect(res.body[0]).to.have.property("_id");
        expect(res.body[0]).to.have.property("email");
        expect(res.body[0]).to.have.property("facility");
        expect(res.body[0]).to.have.property("date");
      });

      it("should not POST facility if user is not logged in on the website or Telegram", async () => {
        const res = await agent.post("/bookedSlots");

        expect(res).to.have.status(401);
        expect(res).to.be.a("Object");
        expect(res.body).to.have.property("success").eql(false);
      });

      afterEach(async () => {
        await usersCollection.updateOne(
          { email: "1@test.com" },
          { $unset: { chatId: "" } }
        );
        await usersCollection.updateOne(
          { email: "2@test.com" },
          { $unset: { chatId: "" } }
        );
        await bookingsCollection.deleteOne(booking1ForUser1);
        await bookingsCollection.deleteOne(booking1ForUser2);
        await bookingsCollection.deleteOne(booking2ForUser2);
        agent.close();
      });
    });

    describe("POST /creditsLeft", () => {
      const newUser = {
        email: "3@test.com",
        password: "1",
      };

      const newUserTelegram = {
        name: "test3",
        chatId: 1003,
      };

      beforeEach(() => {
        agent = chai.request.agent(server);
      });

      it("should POST and return credits left if user is logged in to the website", async () => {
        await agent.post("/register").send(newUser);
        const res = await agent.post("/creditsLeft");

        expect(res).to.have.status(200);
        expect(res.body).to.be.a("Object");
        expect(res.body).to.have.property("credits").eql(6);
      });

      it("should POST and return credits left if user is logged in to Telegram", async () => {
        await agent.post("/register").send(newUser);
        await agent.post("/telegram/login").send(newUserTelegram);
        const res = await agent.post("/creditsLeft").send({ chatId: 1003 });

        expect(res).to.have.status(200);
        expect(res.body).to.be.a("Object");
        expect(res.body).to.have.property("credits").eql(6);
      });

      it("should not POST if the user does not have an account", async () => {
        const res = await agent.post("/creditsLeft").send();

        expect(res).to.have.status(401);
        expect(res.body).to.be.a("Object");
        expect(res.body).to.have.property("success").eql(false);
      });

      it("should not POST if user is not logged in on the website or Telegram", async () => {
        await agent.post("/register").send(newUser);
        await agent.get("/logout");
        const res = await agent.post("/creditsLeft").send();

        expect(res).to.have.status(401);
        expect(res.body).to.be.a("Object");
        expect(res.body).to.have.property("success").eql(false);
      });

      afterEach(async () => {
        await usersCollection.deleteOne({ email: newUser.email });
        await creditsCollection.deleteOne({ email: newUser.email });
        agent.close();
      });
    });

    describe.only("POST /updateCredits", () => {
      const newUser = {
        email: "3@test.com",
        password: "1",
      };

      const newUserTelegram = {
        name: "test3",
        chatId: 1003,
      };

      beforeEach(() => {
        agent = chai.request.agent(server);
      });

      it("should POST and update credits left if user is logged in to the website", async () => {
        await agent.post("/register").send(newUser);
        const res1 = await agent.post("/updateCredits");
        const res2 = await agent.post("/creditsLeft");

        expect(res1).to.have.status(200);
        expect(res1.body).to.be.a("Object");
        expect(res1.body).to.have.property("success").eql(true);

        expect(res2).to.have.status(200);
        expect(res2.body).to.be.a("Object");
        expect(res2.body).to.have.property("credits").eql(5);
      });

      it("should POST and return credits left if user is logged in to Telegram", async () => {
        await agent.post("/register").send(newUser);
        await agent.post("/telegram/login").send(newUserTelegram);
        const res1 = await agent.post("/updateCredits").send({ chatId: 1003 });
        const res2 = await agent.post("/creditsLeft").send({ chatId: 1003 });

        expect(res1).to.have.status(200);
        expect(res1.body).to.be.a("Object");
        expect(res1.body).to.have.property("success").eql(true);

        expect(res2).to.have.status(200);
        expect(res2.body).to.be.a("Object");
        expect(res2.body).to.have.property("credits").eql(5);
      });

      it("should not POST if the user does not have an account", async () => {
        const res = await agent.post("/updateCredits").send();

        expect(res).to.have.status(401);
        expect(res.body).to.be.a("Object");
        expect(res.body).to.have.property("success").eql(false);
      });

      it("should not POST if user is not logged in on the website or Telegram", async () => {
        await agent.post("/register").send(newUser);
        await agent.get("/logout");
        const res = await agent.post("/updateCredits").send();

        expect(res).to.have.status(401);
        expect(res.body).to.be.a("Object");
        expect(res.body).to.have.property("success").eql(false);
      });

      it("should POST and return credits left if user has booked 6 slots", async () => {
        await agent.post("/register").send(newUser);
        await agent.post("/updateCredits");
        await agent.post("/updateCredits");
        await agent.post("/updateCredits");
        await agent.post("/updateCredits");
        await agent.post("/updateCredits");
        await agent.post("/updateCredits");
        const res = await agent.post("/creditsLeft");

        expect(res).to.have.status(200);
        expect(res.body).to.be.a("Object");
        expect(res.body).to.have.property("credits").eql(0);
      });

      it("should not POST if user has no more credits left", async () => {
        await agent.post("/register").send(newUser);
        await agent.post("/updateCredits");
        await agent.post("/updateCredits");
        await agent.post("/updateCredits");
        await agent.post("/updateCredits");
        await agent.post("/updateCredits");
        await agent.post("/updateCredits");
        const res = await agent.post("/updateCredits");

        expect(res).to.have.status(400);
        expect(res.body).to.be.a("Object");
        expect(res.body).to.have.property("success").eql(false);
      });

      afterEach(async () => {
        await usersCollection.deleteOne({ email: newUser.email });
        await creditsCollection.deleteOne({ email: newUser.email });
        agent.close();
      });
    });
  });

  describe("Traffic", () => {
    describe("POST /traffic", () => {
      before(async () => {
        await trafficCollection.insertMany([
          {
            date: new Date(2021, 6, 5, 13, 50),
            traffic: [30, 1, 4, 4, 5, 6],
          },
          {
            date: new Date(2021, 6, 6, 13, 50),
            traffic: [3, 29, 2, 3, 4, 9],
          },
          {
            date: new Date(2021, 6, 12, 13, 50),
            traffic: [0, 5, 3, 1, 1, 1],
          },
          {
            date: new Date(2021, 6, 12, 18, 0),
            traffic: [20, 7, 2, 2, 0, 9],
          },
          {
            date: new Date(2021, 6, 15, 13, 50),
            traffic: [38, 2, 0, 5, 5, 3],
          },
        ]);
      });

      it("should POST facility, date and day", async () => {
        const res = await chai
          .request(server)
          .post("/traffic")
          .send({
            facility: 0,
            date: {
              $gte: new Date(2021, 6, 5),
              $lte: new Date(2021, 6, 16),
            },
            day: [1, 2, 3, 4, 5, 6, 7],
          });

        expect(res).to.have.status(200);
        expect(res.body).to.be.a("Array");
        expect(res.body.length).to.be.eql(2);
        expect(res.body[0]).to.have.property("_id");
        expect(res.body[0]._id).to.have.property("hour").eql("13");
        expect(res.body[0]._id).to.have.property("minute").eql("50");
        expect(res.body[0]).to.have.property("date");
        expect(res.body[0]).to.have.property("count").eql(17.8);

        expect(res.body[1]._id).to.have.property("hour").eql("18");
        expect(res.body[1]._id).to.have.property("minute").eql("00");
        expect(res.body[1]).to.have.property("count").eql(20);
      });

      it("should POST facility, date and day limited to Monday and Friday", async () => {
        const res = await chai
          .request(server)
          .post("/traffic")
          .send({
            facility: 0,
            date: {
              $gte: new Date(2021, 6, 5),
              $lte: new Date(2021, 6, 16),
            },
            day: [2, 6],
          });

        expect(res).to.have.status(200);
        expect(res.body).to.be.a("Array");
        expect(res.body.length).to.be.eql(2);
        expect(res.body[0]).to.have.property("_id");
        expect(res.body[0]._id).to.have.property("hour").eql("13");
        expect(res.body[0]._id).to.have.property("minute").eql("50");
        expect(res.body[0]).to.have.property("count").eql(15);

        expect(res.body[1]._id).to.have.property("hour").eql("18");
        expect(res.body[1]._id).to.have.property("minute").eql("00");
        expect(res.body[1]).to.have.property("count").eql(20);
      });

      it("should POST facility, date and day limited to Sunday, Wednesday, Friday, Saturday", async () => {
        const res = await chai
          .request(server)
          .post("/traffic")
          .send({
            facility: 0,
            date: {
              $gte: new Date(2021, 6, 5),
              $lte: new Date(2021, 6, 16),
            },
            day: [1, 4, 6, 7],
          });

        expect(res).to.have.status(200);
        expect(res.body).to.be.a("Array");
        expect(res.body.length).to.be.eql(0);
      });

      it("should POST facility, date limited to one day and day", async () => {
        const res = await chai
          .request(server)
          .post("/traffic")
          .send({
            facility: 0,
            date: {
              $gte: new Date(2021, 6, 5),
              $lte: new Date(2021, 6, 6),
            },
            day: [1, 2, 3, 4, 5, 6, 7],
          });

        expect(res).to.have.status(200);
        expect(res.body).to.be.a("Array");
        expect(res.body.length).to.be.eql(1);
        expect(res.body[0]).to.have.property("_id");
        expect(res.body[0]._id).to.have.property("hour").eql("13");
        expect(res.body[0]._id).to.have.property("minute").eql("50");
        expect(res.body[0]).to.have.property("count").eql(30);
      });

      it("should POST facility, with non-overlappping date and day", async () => {
        const res = await chai
          .request(server)
          .post("/traffic")
          .send({
            facility: 0,
            date: {
              $gte: new Date(2021, 6, 5),
              $lte: new Date(2021, 6, 7),
            },
            day: [1, 5, 6, 7],
          });

        expect(res).to.have.status(200);
        expect(res.body).to.be.a("Array");
        expect(res.body.length).to.be.eql(0);
      });

      after(async () => {
        await trafficCollection.deleteMany({
          date: {
            $gte: new Date(2021, 6, 5),
            $lte: new Date(2021, 6, 16),
          },
        });
      });
    });
  });

  describe("Telegram", () => {
    describe("POST /telegram/login", () => {
      let agent;

      beforeEach(() => {
        agent = chai.request.agent(server);
      });

      it("should POST name and chatId if the user is logged in to the website", async () => {
        await agent.post("/login").send(existingUser1);
        const res = await agent
          .post("/telegram/login")
          .send(existingUser1Telegram);

        expect(res).to.have.status(200);
        expect(res.body).to.be.a("Object");
        expect(res.body).to.have.property("success").eql(true);
      });

      it("should not POST name and chatId without logging in to the website", async () => {
        const res = await agent
          .post("/telegram/login")
          .send(existingUser1Telegram);

        expect(res).to.have.status(400);
      });

      afterEach(async () => {
        await usersCollection.updateOne(
          { email: "1@test.com" },
          { $unset: { chatId: "" } }
        );
        agent.close();
      });
    });

    describe("POST /telegram/isLoggedIn", () => {
      let agent;

      beforeEach(() => {
        agent = chai.request.agent(server);
      });

      it("should POST chatId if user is logged in", async () => {
        await agent.post("/login").send(existingUser1);
        await agent.post("/telegram/login").send(existingUser1Telegram);
        const res = await chai
          .request(server)
          .post("/telegram/isLoggedIn")
          .send({ chatId: 1001 });

        expect(res).to.have.status(200);
        expect(res.body).to.be.a("Object");
        expect(res.body).to.have.property("success").eql(true);
      });

      it("should not POST chatId if user is not logged in", async () => {
        const res = await chai
          .request(server)
          .post("/telegram/isLoggedIn")
          .send({ chatId: 1001 });

        expect(res).to.have.status(400);
        expect(res.body).to.be.a("Object");
        expect(res.body).to.have.property("success").eql(false);
      });

      afterEach(async () => {
        await usersCollection.updateOne(
          { email: "1@test.com" },
          { $unset: { chatId: "" } }
        );
        agent.close();
      });
    });

    describe("POST /telegram/updateMenus", () => {
      let agent;
      const postUpdateMenu = async (chatId, currentMenu) =>
        await chai
          .request(server)
          .post("/telegram/updateMenus")
          .send({ chatId, currentMenu });

      beforeEach(async () => {
        agent = chai.request.agent(server);
        await agent.post("/login").send(existingUser1);
        await agent.post("/telegram/login").send(existingUser1Telegram);
      });

      it("should POST chatId and currentMenu if the user is starting a new Telegram session", async () => {
        const res = await postUpdateMenu(1001, "Start");

        expect(res).to.have.status(200);
        expect(res.body).to.be.a("Object");
        expect(res.body).to.have.property("success").eql(true);
      });

      it("should POST chatId and currentMenu if the user continues from an existing session", async () => {
        await postUpdateMenu(1001, "Start");
        await postUpdateMenu(1001, "Booking");
        const res = await postUpdateMenu(1001, "BookedSlots");

        expect(res).to.have.status(200);
        expect(res.body).to.be.a("Object");
        expect(res.body).to.have.property("success").eql(true);
      });

      it("should POST chatId and currentMenu if the user is starts a new session on top of an existing session", async () => {
        await postUpdateMenu(1001, "Start");
        await postUpdateMenu(1001, "Booking");
        await postUpdateMenu(1001, "BookedSlots");
        const res = await postUpdateMenu(1001, "Start");

        expect(res).to.have.status(200);
        expect(res.body).to.be.a("Object");
        expect(res.body).to.have.property("success").eql(true);
      });

      it("should POST chatId and currentMenu if the user refreshes at the current menu", async () => {
        await postUpdateMenu(1001, "Start");
        await postUpdateMenu(1001, "Booking");
        await postUpdateMenu(1001, "BookedSlots");
        await postUpdateMenu(1001, "MakeAndCancel");
        await postUpdateMenu(1001, "Kent Ridge Swimming Pool");
        await postUpdateMenu(1001, "Kent Ridge Swimming Pool_Thu Jul 08 2021");
        const res = await postUpdateMenu(
          1001,
          "Kent Ridge Swimming Pool_Thu Jul 08 2021"
        );

        expect(res).to.have.status(200);
        expect(res.body).to.be.a("Object");
        expect(res.body).to.have.property("success").eql(true);
      });

      it("should POST chatId and currentMenu if the user skips to 2 menus before", async () => {
        await postUpdateMenu(1001, "Start");
        await postUpdateMenu(1001, "Booking");
        await postUpdateMenu(1001, "BookedSlots");
        await postUpdateMenu(1001, "MakeAndCancel");
        await postUpdateMenu(1001, "Kent Ridge Swimming Pool");
        await postUpdateMenu(1001, "Kent Ridge Swimming Pool_Thu Jul 08 2021");
        await postUpdateMenu(
          1001,
          "Kent Ridge Swimming Pool_Thu Jul 08 2021_2000"
        );
        await postUpdateMenu(
          1001,
          "Kent Ridge Swimming Pool_Thu Jul 08 2021_2000_Book"
        );
        const res = await postUpdateMenu(
          1001,
          "Kent Ridge Swimming Pool_Thu Jul 08 2021"
        );

        expect(res).to.have.status(200);
        expect(res.body).to.be.a("Object");
        expect(res.body).to.have.property("success").eql(true);
      });

      it("should POST chatId and currentMenu if the user skips to the Start menu", async () => {
        await postUpdateMenu(1001, "Start");
        await postUpdateMenu(1001, "Booking");
        await postUpdateMenu(1001, "BookedSlots");
        await postUpdateMenu(1001, "MakeAndCancel");
        await postUpdateMenu(1001, "Kent Ridge Swimming Pool");
        await postUpdateMenu(1001, "Kent Ridge Swimming Pool_Thu Jul 08 2021");
        await postUpdateMenu(
          1001,
          "Kent Ridge Swimming Pool_Thu Jul 08 2021_2000"
        );
        await postUpdateMenu(
          1001,
          "Kent Ridge Swimming Pool_Thu Jul 08 2021_2000_Book"
        );
        const res = await postUpdateMenu(1001, "Start");

        expect(res).to.have.status(200);
        expect(res.body).to.be.a("Object");
        expect(res.body).to.have.property("success").eql(true);
      });

      it("should POST chatId and currentMenu if there is more than one user with a session", async () => {
        await postUpdateMenu(1001, "Start");
        await postUpdateMenu(1001, "Booking");
        await postUpdateMenu(1001, "BookedSlots");
        await postUpdateMenu(1001, "MakeAndCancel");
        await postUpdateMenu(1001, "Kent Ridge Swimming Pool");
        await postUpdateMenu(1001, "Kent Ridge Swimming Pool_Thu Jul 08 2021");
        await postUpdateMenu(
          1001,
          "Kent Ridge Swimming Pool_Thu Jul 08 2021_2000"
        );
        await postUpdateMenu(
          1001,
          "Kent Ridge Swimming Pool_Thu Jul 08 2021_2000_Book"
        );
        await postUpdateMenu(1001, "Start");

        await agent.get("/logout");
        await agent.post("/login").send(existingUser2);
        await agent.post("/telegram/login").send(existingUser2Telegram);
        await postUpdateMenu(1002, "Start");
        await postUpdateMenu(1002, "Booking");
        await postUpdateMenu(1002, "BookedSlots");
        const res = await postUpdateMenu(1002, "MakeAndCancel");

        expect(res).to.have.status(200);
        expect(res.body).to.be.a("Object");
        expect(res.body).to.have.property("success").eql(true);
      });

      afterEach(async () => {
        await usersCollection.updateOne(
          { email: "1@test.com" },
          { $unset: { chatId: "" } }
        );
        agent.close();
      });
    });

    describe("POST /telegram/getPreviousMenu", () => {
      let agent;
      const postUpdateMenu = async (chatId, currentMenu) =>
        await chai
          .request(server)
          .post("/telegram/updateMenus")
          .send({ chatId, currentMenu });

      beforeEach(async () => {
        agent = chai.request.agent(server);
        await agent.post("/login").send(existingUser1);
        await agent.post("/telegram/login").send(existingUser1Telegram);
      });

      it("should not POST chatId and skips if the user does not have a session yet", async () => {
        const res = await agent
          .post("/telegram/getPreviousMenu")
          .send({ chatId: 1001, skips: 1 });

        expect(res).to.have.status(400);
        expect(res.body).to.be.a("Object");
        expect(res.body).to.have.property("previousMenu").eql(null);
      });

      it("should not POST chatId and skips if the user just started a new Telegram session", async () => {
        await postUpdateMenu(1001, "Start");
        const res = await agent
          .post("/telegram/getPreviousMenu")
          .send({ chatId: 1001, skips: 1 });

        expect(res).to.have.status(400);
        expect(res.body).to.be.a("Object");
        expect(res.body).to.have.property("previousMenu").eql(null);
      });

      it("should POST chatId and skips if the user is starts a new session on top of an existing session", async () => {
        await postUpdateMenu(1001, "Start");
        await postUpdateMenu(1001, "Booking");
        await postUpdateMenu(1001, "BookedSlots");
        await postUpdateMenu(1001, "MakeAndCancel");
        await postUpdateMenu(1001, "Start");
        await postUpdateMenu(1001, "Booking");
        const res = await agent
          .post("/telegram/getPreviousMenu")
          .send({ chatId: 1001, skips: 1 });

        expect(res).to.have.status(200);
        expect(res.body).to.be.a("Object");
        expect(res.body).to.have.property("previousMenu").eql("Start");
      });

      it("should POST chatId and skips if the user wants a menu 2 skips away", async () => {
        await postUpdateMenu(1001, "Start");
        await postUpdateMenu(1001, "Booking");
        await postUpdateMenu(1001, "BookedSlots");
        await postUpdateMenu(1001, "MakeAndCancel");
        const res = await agent
          .post("/telegram/getPreviousMenu")
          .send({ chatId: 1001, skips: 2 });

        expect(res).to.have.status(200);
        expect(res.body).to.be.a("Object");
        expect(res.body).to.have.property("previousMenu").eql("Booking");
      });

      it("should POST chatId and skips if the user wants a menu 3 skips away", async () => {
        await postUpdateMenu(1001, "Start");
        await postUpdateMenu(1001, "Booking");
        await postUpdateMenu(1001, "BookedSlots");
        await postUpdateMenu(1001, "MakeAndCancel");
        await postUpdateMenu(1001, "Kent Ridge Swimming Pool");
        const res = await agent
          .post("/telegram/getPreviousMenu")
          .send({ chatId: 1001, skips: 3 });

        expect(res).to.have.status(200);
        expect(res.body).to.be.a("Object");
        expect(res.body).to.have.property("previousMenu").eql("Booking");
      });

      it("should POST chatId and skips if the user refreshes at the current menu", async () => {
        await postUpdateMenu(1001, "Start");
        await postUpdateMenu(1001, "Booking");
        await postUpdateMenu(1001, "BookedSlots");
        await postUpdateMenu(1001, "MakeAndCancel");
        await postUpdateMenu(1001, "Kent Ridge Swimming Pool");
        await postUpdateMenu(1001, "Kent Ridge Swimming Pool_Thu Jul 08 2021");
        await postUpdateMenu(1001, "Kent Ridge Swimming Pool_Thu Jul 08 2021");
        const res = await agent
          .post("/telegram/getPreviousMenu")
          .send({ chatId: 1001, skips: 1 });

        expect(res).to.have.status(200);
        expect(res.body).to.be.a("Object");
        expect(res.body)
          .to.have.property("previousMenu")
          .eql("Kent Ridge Swimming Pool");
      });

      it("should POST chatId and skips if the user skips to 2 menus before", async () => {
        await postUpdateMenu(1001, "Start");
        await postUpdateMenu(1001, "Booking");
        await postUpdateMenu(1001, "BookedSlots");
        await postUpdateMenu(1001, "MakeAndCancel");
        await postUpdateMenu(1001, "Kent Ridge Swimming Pool");
        await postUpdateMenu(1001, "Kent Ridge Swimming Pool_Thu Jul 08 2021");
        await postUpdateMenu(
          1001,
          "Kent Ridge Swimming Pool_Thu Jul 08 2021_2000"
        );
        await postUpdateMenu(
          1001,
          "Kent Ridge Swimming Pool_Thu Jul 08 2021_2000_Book"
        );
        await postUpdateMenu(1001, "Kent Ridge Swimming Pool_Thu Jul 08 2021");
        const res = await agent
          .post("/telegram/getPreviousMenu")
          .send({ chatId: 1001, skips: 1 });

        expect(res).to.have.status(200);
        expect(res.body).to.be.a("Object");
        expect(res.body)
          .to.have.property("previousMenu")
          .eql("Kent Ridge Swimming Pool");
      });

      it("should not POST chatId and skips if the user skips to the Start menu", async () => {
        await postUpdateMenu(1001, "Start");
        await postUpdateMenu(1001, "Booking");
        await postUpdateMenu(1001, "BookedSlots");
        await postUpdateMenu(1001, "MakeAndCancel");
        await postUpdateMenu(1001, "Kent Ridge Swimming Pool");
        await postUpdateMenu(1001, "Kent Ridge Swimming Pool_Thu Jul 08 2021");
        await postUpdateMenu(
          1001,
          "Kent Ridge Swimming Pool_Thu Jul 08 2021_2000"
        );
        await postUpdateMenu(
          1001,
          "Kent Ridge Swimming Pool_Thu Jul 08 2021_2000_Book"
        );
        await postUpdateMenu(1001, "Start");
        const res = await agent
          .post("/telegram/getPreviousMenu")
          .send({ chatId: 1001, skips: 1 });

        expect(res).to.have.status(400);
        expect(res.body).to.be.a("Object");
        expect(res.body).to.have.property("previousMenu").eql(null);
      });

      it("should POST chatId and skips if there is more than one user with a session", async () => {
        await postUpdateMenu(1001, "Start");
        await postUpdateMenu(1001, "Booking");
        await postUpdateMenu(1001, "BookedSlots");
        await postUpdateMenu(1001, "MakeAndCancel");
        await postUpdateMenu(1001, "Kent Ridge Swimming Pool");
        await postUpdateMenu(1001, "Kent Ridge Swimming Pool_Thu Jul 08 2021");
        await postUpdateMenu(
          1001,
          "Kent Ridge Swimming Pool_Thu Jul 08 2021_2000"
        );
        await postUpdateMenu(
          1001,
          "Kent Ridge Swimming Pool_Thu Jul 08 2021_2000_Book"
        );
        await postUpdateMenu(1001, "Start");

        await agent.get("/logout");
        await agent.post("/login").send(existingUser2);
        await agent.post("/telegram/login").send(existingUser2Telegram);
        await postUpdateMenu(1002, "Start");
        await postUpdateMenu(1002, "Booking");
        await postUpdateMenu(1002, "BookedSlots");
        await postUpdateMenu(1002, "MakeAndCancel");
        const res = await agent
          .post("/telegram/getPreviousMenu")
          .send({ chatId: 1002, skips: 1 });

        expect(res).to.have.status(200);
        expect(res.body).to.be.a("Object");
        expect(res.body).to.have.property("previousMenu").eql("BookedSlots");
      });

      afterEach(async () => {
        await usersCollection.updateOne(
          { email: "1@test.com" },
          { $unset: { chatId: "" } }
        );
        await usersCollection.updateOne(
          { email: "2@test.com" },
          { $unset: { chatId: "" } }
        );
        await telegramSessionsCollection.deleteMany({
          chatId: { $in: [1001, 1002] },
        });
        agent.close();
      });
    });

    describe("GET /telegram/currentTraffic", () => {
      it("should GET the current traffic", async () => {
        const res = await chai.request(server).get("/telegram/currentTraffic");

        expect(res).to.have.status(200);
        expect(res.body).to.be.a("Array").with.length(6);
        expect(res.body[0]).to.be.a("Number").lessThanOrEqual(40);
        expect(res.body[1]).to.be.a("Number").lessThanOrEqual(40);
        expect(res.body[2]).to.be.a("Number").lessThanOrEqual(40);
        expect(res.body[3]).to.be.a("Number").lessThanOrEqual(40);
        expect(res.body[4]).to.be.a("Number").lessThanOrEqual(40);
        expect(res.body[5]).to.be.a("Number").lessThanOrEqual(40);
      });
    });
  });

  after(async () => {
    await usersCollection.deleteOne({ email: existingUser1.email });
    await usersCollection.deleteOne({ email: existingUser2.email });
    await creditsCollection.deleteOne({ email: existingUser1.email });
    await creditsCollection.deleteOne({ email: existingUser2.email });
    mongoose.disconnect();
  });
});
