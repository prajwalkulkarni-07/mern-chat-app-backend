import User from "../models/user.model.js";
import Message from "../models/message.model.js";

import cloudinary from "../lib/cloudinary.js";
import { getReceiverSocketId, io } from "../lib/socket.js";

export const getUsersForSidebar = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;
    
    // Get the user with populated friends
    const currentUser = await User.findById(loggedInUserId).populate({
      path: "friends",
      select: "-password",
    });

    if (!currentUser) {
      return res.status(404).json({ error: "User not found" });
    }

    res.status(200).json(currentUser.friends || []);
  } catch (error) {
    console.error("Error in getUsersForSidebar: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const searchUsers = async (req, res) => {
  try {
    const { email } = req.query;
    const loggedInUserId = req.user._id;

    if (!email) {
      return res.status(400).json({ error: "Email is required for search" });
    }

    // Find users whose email contains the search term (case insensitive)
    const users = await User.find({
      email: { $regex: email, $options: "i" },
      _id: { $ne: loggedInUserId }, // Exclude the logged-in user
    }).select("-password");

    res.status(200).json(users);
  } catch (error) {
    console.error("Error in searchUsers: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const addFriend = async (req, res) => {
  try {
    const { userId } = req.body;
    const loggedInUserId = req.user._id;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    // Check if the user exists
    const userToAdd = await User.findById(userId);
    if (!userToAdd) {
      return res.status(404).json({ error: "User not found" });
    }

    // Add to current user's friends if not already a friend
    const currentUser = await User.findById(loggedInUserId);
    if (currentUser.friends.includes(userId)) {
      return res.status(400).json({ error: "User is already a friend" });
    }

    // Add each other as friends (bidirectional)
    await User.findByIdAndUpdate(loggedInUserId, { $push: { friends: userId } });
    await User.findByIdAndUpdate(userId, { $push: { friends: loggedInUserId } });

    // Get the updated user with populated friends
    const updatedUser = await User.findById(userId).select("-password");

    res.status(200).json(updatedUser);
  } catch (error) {
    console.error("Error in addFriend: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Keep the existing functions
export const getMessages = async (req, res) => {
  try {
    const { id: userToChatId } = req.params;
    const myId = req.user._id;

    const messages = await Message.find({
      $or: [
        { senderId: myId, receiverId: userToChatId },
        { senderId: userToChatId, receiverId: myId },
      ],
    });

    res.status(200).json(messages);
  } catch (error) {
    console.log("Error in getMessages controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const sendMessage = async (req, res) => {
  try {
    const { text, file } = req.body;
    const { id: receiverId } = req.params;
    const senderId = req.user._id;

    let fileData = null;
    if (file) {
      // Upload base64 file to cloudinary
      const uploadResponse = await cloudinary.uploader.upload(file.data, {
        resource_type: "auto", // auto-detect file type
        folder: "chat_app_files",
      });
      
      fileData = {
        url: uploadResponse.secure_url,
        type: file.type,
        name: file.name,
        size: file.size,
      };
    }

    const newMessage = new Message({
      senderId,
      receiverId,
      text,
      file: fileData,
    });

    await newMessage.save();

    const receiverSocketId = getReceiverSocketId(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("newMessage", newMessage);
    }

    res.status(201).json(newMessage);
  } catch (error) {
    console.log("Error in sendMessage controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};
