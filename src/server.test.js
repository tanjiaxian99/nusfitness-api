const chai = require("chai");
const chaiHttp = require("chai-http");
const expect = chai.expect;
chai.use(chaiHttp);
const server = "http://local.nusfitness.com:5000";
const mongoose = require("mongoose");

describe("Backend Tests", () => {
  let users;

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

  after(() => {
    mongoose.disconnect();
  });
});
