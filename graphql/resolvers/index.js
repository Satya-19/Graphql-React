const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const DataLoader = require("dataloader");

const Event = require("../..//models/event");
const User = require("../../models/user");
const Booking = require("../../models/booking");

const eventLoader = new DataLoader((eventIds) => {
  return events(eventIds);
});

const userLoader = new DataLoader((userIds) => {
  return User.find({ _id: { $in: userIds } });
});

const transformedEvent = (event) => {
  return {
    ...event._doc,
    date: new Date(event._doc.date).toISOString(),
    creator: user.bind(this, event.creator),
  };
};

const events = (eventIds) => {
  return Event.find({ _id: { $in: eventIds } }).then((events) => {
    events.sort((a, b) => {
      return (
        eventIds.indexOf(a._id.toString()) - eventIds.indexOf(b._id.toString())
      );
    });
    return events.map((event) => {
      return transformedEvent(event);
    });
  });
};

const singleEvent = async (eventId) => {
  try {
    const event = await eventLoader.load(eventId.toString());
    return event;
  } catch (err) {
    throw err;
  }
};

const user = async (userId) => {
  try {
    const user = await userLoader.load(userId.toString());
    return {
      ...user._doc,
      password: "*******",
      createdEvents: () => eventLoader.loadMany(user._doc.createdEvents),
    };
  } catch (err) {
    throw err;
  }
};

module.exports = {
  events: () => {
    return Event.find()
      .then((events) => {
        return events.map((event) => {
          return transformedEvent(event);
        });
      })
      .catch((err) => {
        throw err;
      });
  },
  bookings: async (args, req) => {
    if (!req.isAuth) throw new Error("Unauthenticated");

    try {
      const bookings = await Booking.find({ user: req.userId });
      return bookings.map((booking) => {
        return {
          ...booking._doc,
          user: user.bind(this, booking._doc.user),
          event: singleEvent.bind(this, booking._doc.event),
          createdAt: new Date(booking._doc.createdAt).toISOString(),
          updatedAt: new Date(booking._doc.createdAt).toISOString(),
        };
      });
    } catch (err) {
      throw err;
    }
  },
  createEvent: (args, req) => {
    if (!req.isAuth) throw new Error("Unauthenticated");

    const event = new Event({
      title: args.eventInput.title,
      description: args.eventInput.description,
      price: +args.eventInput.price,
      date: new Date(args.eventInput.date),
      creator: req.userId,
    });
    let createdEvent;
    return event
      .save()
      .then((result) => {
        createdEvent = transformedEvent(event);
        return User.findById(req.userId);
      })
      .then((user) => {
        if (!user) throw new Error("User doesn't exists");
        user.createdEvents.push(event);
        return user.save();
      })
      .then((result) => {
        return createdEvent;
      })
      .catch((err) => {
        console.log(err);
        throw err;
      });
  },
  createUser: (args) => {
    return User.findOne({ email: args.userInput.email })
      .then((user) => {
        if (user) throw new Error("User already exists");
        return bcrypt.hash(args.userInput.password, 12);
      })
      .then((hashedPassword) => {
        const user = new User({
          email: args.userInput.email,
          password: hashedPassword,
        });
        return user.save();
      })
      .then((result) => {
        return { ...result._doc, password: null };
      })
      .catch((err) => {
        throw err;
      });
  },
  bookEvent: async (args, req) => {
    if (!req.isAuth) throw new Error("Unauthenticated");

    const fetchedEvent = await Event.findOne({ _id: args.eventId });
    const booking = new Booking({
      user: req.userId,
      event: fetchedEvent,
    });
    const result = await booking.save();
    return {
      ...result._doc,
      user: user.bind(this, booking._doc.user),
      event: singleEvent.bind(this, booking._doc.event),
      createdAt: new Date(result._doc.createdAt).toISOString(),
      updatedAt: new Date(result._doc.updatedAt).toISOString(),
    };
  },
  cancelBooking: async (args, req) => {
    if (!req.isAuth) throw new Error("Unauthenticated");

    try {
      const booking = await Booking.findById(args.bookingId).populate("event");
      const event = {
        ...booking.event._doc,
        creator: user.bind(this, booking.event._doc.creator),
      };
      await Booking.deleteOne({ _id: args.bookingId });
      return event;
    } catch (err) {
      throw err;
    }
  },
  login: async ({ email, password }) => {
    const user = await User.findOne({ email: email });
    if (!user) throw new Error("User not found");

    const isEqual = await bcrypt.compare(password, user.password);
    if (!isEqual) throw new Error("Incorrect Password");

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      "secret_key",
      {
        expiresIn: "1h",
      }
    );
    return { userId: user.id, token: token, tokenExp: 1 };
  },
};
