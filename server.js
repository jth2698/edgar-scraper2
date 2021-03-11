const express = require("express");
const session = require("express-session");
const logger = require("morgan");
const mongoose = require("mongoose");

const main = require('./main');

const PORT = process.env.PORT || 8081;
const app = express();

//body-parser for url encoding and json
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
//morgan logger
app.use(logger("dev"));
//session info
app.use(session({ secret: "keyboard cat", resave: true, saveUninitialized: true }));

mongoose.connect(
    process.env.MONGODB_URI || "mongodb://localhost/clausedb",
    {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        useCreateIndex: true,
        useFindAndModify: false,
    }
);

app.listen(PORT, () => {
    console.log(`App is active at http://localhost:${PORT}`);
});

main();