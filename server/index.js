const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const passport = require("passport");
const LocalStratergy = require("passport-local").Strategy
const cors = require("cors");
const jwt = require("jsonwebtoken");
const app = express();
const multer = require("multer");

const User = require("./models/UserModel");
const Message = require("./models/MessageModel");

const port = 5000;

app.use(cors());
app.use(bodyParser.urlencoded({extended: false}))
app.use(bodyParser.json());
app.use(passport.initialize());

mongoose.connect("mongodb+srv://inaamchill:inaam17632@chatapp.ft2pq.mongodb.net/?retryWrites=true&w=majority&appName=chatapp")
.then(() => {
    console.log("Database Connected...")
}).catch((error) => {
    console.log(error);
})

const Storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'files/'); // Specify the destination folder
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname); // Define the filename format
    }
});

//Endpoint For Regisering a New User
app.post('/register', (req, res) => {
    const {name, email, password, image} = req.body;
    
    const newUser = new User({name, email, password, image})
    newUser.save()
    .then(() => {
        res.status(200).json({message: "User Registered Succesfully"})
    }).catch((error) => {
        res.status(500).json({message:"error"})
        console.log(error);
    })
})

//Function to create token
const createToken = (userId) => {
    const payload = {
        userId: userId
    }
    const token = jwt.sign(payload, "Q$utqg2u%DRWUuf", {expiresIn: "1h"});
    return token;
}

//Endpoint For Login
app.post('/login', (req, res) => {
    const {email, password} = req.body;

    //Check if email and password is provided
    if(!email || !password){
        return res.status(404).json({message:"email and password required"})
    }

    //check if user is available
    User.findOne({email}).then((user) => {
        if(!user){
            return res.status(404).json({message: "User not found"})
        }
        //check if password is correct
        if(user.password !== password){
            return res.status(404).json({message: "invalid password"})
        }

        const token = createToken(user._id);
        res.status(200).json({token})
    }).catch((error) => {
        console.log("Error cannot find user" , error)
        res.status(500).json({message: "Internal server error"})
    })

})

//Endpoint to get all users except the current user
app.get('/user/:userId', (req, res) => {
    const currentUser = req.params.userId;

    User.find({ _id: {$ne: currentUser}}).then((users) => {
        res.status(200).json(users)
    }).catch((Error) => {
        console.log(Error)
        res.status(500).json({"message": Error})
    })
})

//Endpoint to send a request to user
app.post('/friend-request', async (req, res) => {
    const {currentUser, selectedUserId} = req.body;

    try {
        await User.findByIdAndUpdate(selectedUserId, {
            $push: {friendRequests: currentUser}
        });
        await User.findByIdAndUpdate(currentUser, {
            $push: {sentFriendRequests: selectedUserId}
        });
        res.sendStatus(200)
    } catch (error) {
        res.sendStatus(500)
    }
})

//Endoint to show all Friend-Requests
app.get('/friend-request/:userId', async (req, res) => {
    try {
        const {userId} = req.params;

        const user = await User.findById(userId).populate("friendRequests", "name email image").lean();
        const friendRequests = user.friendRequests;
        res.status(200).json(friendRequests);
    } catch (error) {
        console.log(error);
        res.status(500).json({"message": "internal server error"})
    }
})

//Endpoint to accept Friend Request
app.post('/friend-request/accept', async (req, res) => {
    try {
        const {senderId, recepientId} = req.body;

        const sender = await User.findById(senderId);
        const recepient = await User.findById(recepientId);
    
        sender.friends.push(recepientId);
        recepient.friends.push(senderId);
    
        recepient.friendRequests = recepient.friendRequests.filter((request) => request.toString() !== senderId.toString());
    
        sender.sentFriendRequests = sender.sentFriendRequests.filter((request) => request.toString() !== recepientId.toString());
    
        await sender.save();
        await recepient.save();
    
        res.status(200).json({"message": "Friend requested  sucesfully accepted"})
    } catch (error) {
        console.log(error);
        res.status(500).json("Internal server error")
    }
})

//Endpoint to access all friends of he current user
app.get('/accepted-friends/:userId', async (req, res) => {
    try {
        const {userId} = req.params;
        const user = await User.findById(userId).populate(
            "friends",
            "name email image"
        )
        const acceptedFriends = user.friends;
        res.status(200).json(acceptedFriends);
    } catch (error) {
        console.log(error);
        res.status(500).send(error)
    }
})

const upload = multer({storage : Storage});

//Post messages and Add o backend
app.post("/messages",upload.single('imageFile'), async (req, res) => {
    try {
        const {senderId,recepientId,messageType,messageText} = req.body;

        const newMessage = new Message({
            senderId,
            recepientId,
            messageType,
            message: messageText,
            timestamp: new Date(),
            imageUrl: messageType === "image"
        });
        await newMessage.save();
        res.status(200).json({message: "message send Succesfully"})
    } catch (error) {
        console.log(error)
        res.status(500).json({error: "inttermal server error"})
    }
})

//Endpoint to get userdetails of the Currentchatting user
app.get('/currentuser/:userId', async (req, res) => {
    try {
        const {userId} = req.params;

        const recepientId = await User.findById(userId);
        res.json(recepientId); 
    } catch (error) {
        console.log(error)
        res.status(500).send('error')
    }
})

//Endpint to get messages between 2 users in Chat
app.get('/messages/:senderId/:recepientId', async (req, res) => {
    try {
        const { senderId, recepientId } = req.params;

        const messages = await Message.find({
            $or: [
                { senderId: senderId, recepientId: recepientId },  // Sender to recipient
                { senderId: recepientId, recepientId: senderId }   // Recipient to sender
            ]
        }).populate("senderId", "_id name");

        res.json(messages);
    } catch (error) {
        console.log(error);
        res.status(500).send({ "error": "internal server error" });
    }
});


app.listen(port, (req, res) => {
    console.log("Server Running...")
})