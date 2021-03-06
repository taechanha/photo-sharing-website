"use strict";

var session = require("express-session");
var bodyParser = require("body-parser");
var multer = require("multer");
var mongoose = require("mongoose");
mongoose.Promise = require("bluebird");
var express = require("express");
var router = express.Router();

const path = require("path");
var async = require("async");

// Load the Mongoose schema for User, Photo, and SchemaInfo
var User = require("./schema/user.js");
var Photo = require("./schema/photo.js");
var SchemaInfo = require("./schema/schemaInfo.js");

var app = express();

mongoose.connect("mongodb://localhost/cs142project6", { useMongoClient: true });

app.use(express.static(__dirname));
app.use(
  session({ secret: "secretKey", resave: false, saveUninitialized: false })
);
app.use(bodyParser.json());

app.get("/", function(request, response) {
  response.send("Simple web server of files from " + __dirname);
});

/*
 * Use express to handle argument passing in the URL.  This .get will cause express
 * To accept URLs with /test/<something> and return the something in request.params.p1
 * If implement the get as follows:
 * /test or /test/info - Return the SchemaInfo object of the database in JSON format. This
 *                       is good for testing connectivity with  MongoDB.
 * /test/counts - Return an object with the counts of the different collections in JSON format
 */
app.get("/test/:p1", function(request, response) {
  // Express parses the ":p1" from the URL and returns it in the request.params objects.
  console.log("/test called with param1 = ", request.params.p1);

  var param = request.params.p1 || "info";

  if (param === "info") {
    // Fetch the SchemaInfo. There should only one of them. The query of {} will match it.
    SchemaInfo.find({}, function(err, info) {
      if (err) {
        // Query returned an error.  We pass it back to the browser with an Internal Service
        // Error (500) error code.
        console.error("Doing /user/info error:", err);
        response.status(500).send(JSON.stringify(err));
        return;
      }
      if (info.length === 0) {
        // Query didn't return an error but didn't find the SchemaInfo object - This
        // is also an internal error return.
        response.status(500).send("Missing SchemaInfo");
        return;
      }

      // We got the object - return it in JSON format.
      response.end(JSON.stringify(info[0]));
    });
  } else if (param === "counts") {
    // In order to return the counts of all the collections we need to do an async
    // call to each collections. That is tricky to do so we use the async package
    // do the work.  We put the collections into array and use async.each to
    // do each .count() query.
    var collections = [
      { name: "user", collection: User },
      { name: "photo", collection: Photo },
      { name: "schemaInfo", collection: SchemaInfo }
    ];
    async.each(
      collections,
      function(col, done_callback) {
        col.collection.count({}, function(err, count) {
          col.count = count;
          done_callback(err);
        });
      },
      function(err) {
        if (err) {
          response.status(500).send(JSON.stringify(err));
        } else {
          var obj = {};
          for (var i = 0; i < collections.length; i++) {
            obj[collections[i].name] = collections[i].count;
          }
          response.end(JSON.stringify(obj));
        }
      }
    );
  } else {
    // If we know understand the parameter we return a (Bad Parameter) (400) status.
    response.status(400).send("Bad param " + param);
  }
});

/*
 * URL /user/list - Return all the User object.
 */
app.get("/user/list", function(request, response) {
  if (!request.session.user) {
    response.status(401).send("Nobody currently logged in");
    return;
  }

  User.find({}, function(err, users) {
    if (err) {
      console.log("Doing /user/list error:", err);
      response.status(400).send(JSON.stringify(err));
      return;
    }
    if (users.length === 0) {
      console.log("Missing User");
      response.status(400).send("Missing User");
      return;
    }
    users = users.map(function(user) {
      user = JSON.parse(JSON.stringify(user));
      delete user.location;
      delete user.description;
      delete user.occupation;
      delete user.__v;
      return user;
    });
    response.status(200).send(users);
  });
});

/*
 * URL /user/:id - Return the information for User (id)
 */
app.get("/user/:id", function(request, response) {
  if (!request.session.user) {
    response.status(401).send("Nobody currently logged in");
    return;
  }

  var id = request.params.id;
  User.findById(id, function(err, user) {
    if (err) {
      console.log("Doing /user/:id error:", err);
      response.status(400).send(JSON.stringify(err));
      return;
    }
    if (user === null) {
      console.log("User with _id: " + id + " not found.");
      response.status(400).send("Not found");
      return;
    }
    user = JSON.parse(JSON.stringify(user));
    delete user.__v;
    response.status(200).send(user);
  });
});

/*
 * URL /photosOfUser/:id - Return the Photos for User (id)
 */
app.get("/photosOfUser/:id", function(request, response) {
  if (!request.session.user) {
    response.status(401).send("Nobody currently logged in");
    return;
  }

  var id = request.params.id;
  Photo.find({ user_id: id }, async function(err, photos) {
    if (err) {
      console.log("Doing /photosOfUser/:id error:", err);
      response.status(400).send(JSON.stringify(err));
      return;
    }
    if (photos.length === 0) {
      console.log("Photos for user with _id: " + id + " not found.");
      response.status(400).send("Not found");
      return;
    }

    const photosArray = photos.map(async function(photo) {
      photo = JSON.parse(JSON.stringify(photo));
      const commentsArray = photo.comments.map(async function(comment) {
        comment = JSON.parse(JSON.stringify(comment));
        await User.findById(comment.user_id, function(err, user) {
          if (err) {
            console.log("Doing /photosOfUser/:id search comments error:", err);
            response.status(400).send(JSON.stringify(err));
          }
          if (user === null) {
            console.log("User with _id: " + comment.user_id + " not found.");
            response.status(400).send("Not found");
          }
          user = JSON.parse(JSON.stringify(user));
          delete user.location;
          delete user.description;
          delete user.occupation;
          delete user.__v;
          comment.user = user;
        });

        delete comment.user_id;
        return comment;
      });

      photo.comments = await Promise.all(commentsArray);
      delete photo.__v;
      return photo;
    });

    photos = await Promise.all(photosArray);
    response.status(200).send(photos);
  });
});

/*
 * URL /photo/new - Return
 */

// Set The Storage Engine

const getDate = Date.now();

const storage = multer.diskStorage({
  destination: "./images/",
  filename: function(req, file, cb) {
    cb(null, file.originalname);
    // can do file.fieldname + "-" + getDate + path.extname(file.originalname)) to avoid clashes
  }
});

// Init Upload
const upload = multer({
  storage: storage,
  limits: { fileSize: 1000000 },
  fileFilter: function(req, file, cb) {
    checkFileType(file, cb);
  }
}).single("myImage");

// Check File Type
function checkFileType(file, cb) {
  // Allowed ext
  const filetypes = /jpeg|jpg|png|gif/;
  // Check ext
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  // Check mime
  const mimetype = filetypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb("Error: Images Only!");
  }
}

app.set("view engine", "html");

app.post("/upload", (req, res) => {
  try {
    // console.log(req.session.user._id);
    // console.log(req);
    upload(req, res, err => {
      console.log(res.req.file.originalname);
      if (err) {
        console.log("error");
      } else {
        if (req.file == undefined) {
          console.log("No File Selected");
        } else {
          console.log("all done");
          console.log("saving to db");
          const date = new Date();
          const pic = {
            file_name: res.req.file.originalname,
            user_id: req.session.user._id,
            comments: [],
            date_time: date
          };

          // console.log(pic);
          // add this one to scheme

          Photo.create(pic, function(err, photo) {
            if (err) {
              console.log("Doing /photo/new error:", err);
              response.status(400).send(JSON.stringify(err));
              return;
            }
            req.session.photo = photo;
            res.status(200).send(photo);
          });
        }
      }
    });
  } catch (e) {
    return;
  } finally {
  }
});

// console.log("+");
// console.log(request.body);
// console.log(request.session.user._id);

// Photo.findByIdAndUpdate

/*
 * URL /admin/login - Return
 */
app.post("/admin/login", function(request, response) {
  var loginName = request.body.login_name;
  User.findOne({ login_name: loginName }, function(err, user) {
    if (err) {
      console.log("Doing /admin/login error:", err);
      response.status(400).send(JSON.stringify(err));
      return;
    }
    if (user === null) {
      console.log("User with user_name: " + loginName + " not found.");
      response.status(400).send("Not found");
      return;
    }
    user = JSON.parse(JSON.stringify(user));
    delete user.location;
    delete user.description;
    delete user.occupation;
    delete user.__v;
    request.session.user = user;
    response.status(200).send(user);
  });
});

app.post("/admin/register", function(request, response) {
  var registerName = {
    first_name: request.body.login_name,
    last_name: "",
    login_name: request.body.login_name,
    location: "",
    description: "",
    occupation: ""
  };

  // add this one to scheme
  User.create(registerName, function(err, user) {
    if (err) {
      console.log("Doing /admin/register error:", err);
      response.status(400).send(JSON.stringify(err));
      return;
    }
    //user = JSON.parse(JSON.stringify(user));
    // delete user.location;
    // delete user.description;
    // delete user.occupation;
    // delete user.__v;
    request.session.user = user;
    response.status(200).send(user);
  });
});

/*
 *
 */
app.post("/admin/logout", function(request, response) {
  if (request.session.user) {
    request.session.user = null;
    response.status(200).send("Success");
  } else {
    response.status(400).send("Nobody currently logged in");
  }
});

/*
 *
 */
app.post("/commentsOfPhoto/:photo_id", function(request, response) {
  var photo_id = request.params.photo_id;
  if (!request.body.comment) {
    console.log("Doing /commentsOfPhoto/" + photo_id + " error: empty comment");
    response.status(400).send("Comment needs to be nonempty");
    return;
  }
  var newComment = {
    comment: request.body.comment,
    date_time: new Date(),
    user_id: request.session.user._id
  };
  Photo.findByIdAndUpdate(
    photo_id,
    { $push: { comments: newComment } },
    function(err, result) {
      if (err) {
        console.log("Doing /commentsOfPhoto/" + photo_id + " error:", err);
        response.status(400).send(JSON.stringify(err));
        return;
      }
      newComment.user = request.session.user;
      response.status(200).send(newComment);
    }
  );
});

var server = app.listen(3000, function() {
  var port = server.address().port;
  console.log(
    "Listening at http://localhost:" +
      port +
      " exporting the directory " +
      __dirname
  );
});
