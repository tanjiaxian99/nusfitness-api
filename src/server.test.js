const chai = require("chai");
const chaiHttp = require("chai-http");
const expect = chai.expect;
chai.use(chaiHttp);
const server = "http://local.nusfitness.com:5000";
const mongoose = require("mongoose");

describe("Backend Tests", () => {
  let users;
  let bookings;

  before(() => {
    // Localhost
    mongoose.connect("mongodb://localhost:27017/nusfitness", {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      useCreateIndex: true,
      useFindAndModify: false,
    });

    const db = mongoose.connection;
    users = db.collection("users");
    bookings = db.collection("booking");
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
        expect(res).to.be.a("Object");
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
        expect(res).to.be.a("Object");
        expect(res.body).to.have.property("name").eql("UserExistsError");
        expect(res.body)
          .to.have.property("message")
          .eql("A user with the given username is already registered");
      });

      afterEach(async () => {
        await users.deleteOne({ email: "e0000000X@u.nus.edu" });
      });
    });

    describe("POST /login", () => {
      const existingUser = {
        email: "1@1",
        password: "1",
      };

      const nonExistingUser = {
        email: "e0000000X@u.nus.edu",
        password: "123",
      };

      const existingUserWrongPassword = {
        email: "1@1",
        password: "2",
      };

      it("should POST a user's email and password and login", async () => {
        const res = await chai
          .request(server)
          .post("/login")
          .send(existingUser);

        expect(res).to.have.status(200);
        expect(res).to.be.a("Object");
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
      const existingUser = {
        email: "1@1",
        password: "1",
      };

      const nonExistingUser = {
        email: "e0000000X@u.nus.edu",
        password: "123",
      };

      let agent;

      beforeEach(() => {
        agent = chai.request.agent(server);
      });

      it("should GET login status if user is logged in", async () => {
        await agent.post("/login").send(existingUser);

        const res = await agent.get("/isLoggedIn").send(existingUser);

        expect(res).to.have.status(200);
        expect(res).to.be.a("Object");
        expect(res.body).to.have.property("authenticated").eql(true);
      });

      it("should GET login status if user is not logged in", async () => {
        const res = await agent.get("/isLoggedIn").send(existingUser);

        expect(res).to.have.status(200);
        expect(res).to.be.a("Object");
        expect(res.body).to.have.property("authenticated").eql(false);
      });

      it("should GET login status if user does not have an account", async () => {
        await agent.post("/login").send(nonExistingUser);

        const res = await agent.get("/isLoggedIn").send(nonExistingUser);

        expect(res).to.have.status(200);
        expect(res).to.be.a("Object");
        expect(res.body).to.have.property("authenticated").eql(false);
      });

      afterEach(() => {
        agent.close();
      });
    });
  });

  describe("Booking", () => {
    describe("POST /book", () => {
      const existingUser = {
        email: "1@1",
        password: "1",
      };

      const existingUserTelegram = {
        name: "test",
        chatId: 1001,
      };

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
        await agent.post("/login").send(existingUser);
        const res = await agent.post("/book").send(booking);

        expect(res).to.have.status(200);
        expect(res).to.be.a("Object");
        expect(res.body).to.have.property("success").eql(true);
      });

      it("should POST booking details if user is logged in on Telegram and slot can be booked", async () => {
        await agent.post("/login").send(existingUser);
        await agent.post("/telegram/login").send(existingUserTelegram);
        const res = await chai
          .request(server)
          .post("/book")
          .send(bookingTelegram);

        expect(res).to.have.status(200);
        expect(res).to.be.a("Object");
        expect(res.body).to.have.property("success").eql(true);
      });

      it("should not POST booking details if user is not logged in on the website or Telegram", async () => {
        const res = await agent.post("/book").send(booking);

        expect(res).to.have.status(401);
        expect(res).to.be.a("Object");
        expect(res.body).to.have.property("success").eql(false);
      });

      it("should not POST booking details if the slot is full", async () => {
        const bookingArray = [];
        for (let i = 0; i < 20; i++) {
          bookingArray.push({ ...booking });
        }
        bookings.insertMany(bookingArray);

        await agent.post("/login").send(existingUser);
        const res = await agent.post("/book").send(booking);

        expect(res).to.have.status(403);
        expect(res).to.be.a("Object");
        expect(res.body).to.have.property("success").eql(false);
      });

      afterEach(async () => {
        await users.updateOne({ email: "1@1" }, { $unset: { chatId: "" } });
        await bookings.deleteMany(booking);
        agent.close();
      });
    });

    describe("POST /cancel", () => {
      const existingUser = {
        email: "1@1",
        password: "1",
      };

      const existingUserTelegram = {
        name: "test",
        chatId: 1001,
      };

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
        await agent.post("/login").send(existingUser);
        await agent.post("/book").send(booking);
        const res = await agent.post("/cancel").send(booking);

        expect(res).to.have.status(200);
        expect(res).to.be.a("Object");
        expect(res.body).to.have.property("success").eql(true);
      });

      it("should POST booking details if user is logged in on Telegram and slot can be booked", async () => {
        await agent.post("/login").send(existingUser);
        await agent.post("/telegram/login").send(existingUserTelegram);
        await chai.request(server).post("/book").send(bookingTelegram);
        const res = await agent.post("/cancel").send(bookingTelegram);

        expect(res).to.have.status(200);
        expect(res).to.be.a("Object");
        expect(res.body).to.have.property("success").eql(true);
      });

      it("should not POST booking details if user is not logged in on the website or Telegram", async () => {
        await agent.post("/login").send(existingUser);
        await agent.post("/book").send(booking);
        await agent.get("/logout");
        const res = await agent.post("/cancel").send(booking);

        expect(res).to.have.status(401);
        expect(res).to.be.a("Object");
        expect(res.body).to.have.property("success").eql(false);
      });

      it("should not POST booking details if the slot is within the 2-hour cancellation window", async () => {
        await agent.post("/login").send(existingUser);
        await agent.post("/book").send(bookingWithin2HourWindow);
        const res = await agent.post("/cancel").send(bookingWithin2HourWindow);

        expect(res).to.have.status(403);
        expect(res).to.be.a("Object");
        expect(res.body).to.have.property("success").eql(false);
      });

      afterEach(async () => {
        await users.updateOne({ email: "1@1" }, { $unset: { chatId: "" } });
        await bookings.deleteMany(booking);
        await bookings.deleteMany(bookingWithin2HourWindow);
        agent.close();
      });
    });

    describe("POST /slots", () => {
      const existingUser = {
        email: "1@1",
        password: "1",
      };

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
        await agent.post("/login").send(existingUser);
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
        await agent.post("/login").send(existingUser);
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

      afterEach(async () => {
        await users.updateOne({ email: "1@1" }, { $unset: { chatId: "" } });
        await bookings.deleteMany({ date: { $gte: new Date(2050, 0, 1) } });
        agent.close();
      });
    });
  });

  after(() => {
    mongoose.disconnect();
  });
});
