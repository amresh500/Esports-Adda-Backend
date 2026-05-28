const mongoose = require("mongoose");

const streamSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 5,
      maxlength: 200,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    youtubeUrl: {
      type: String,
      required: true,
      validate: {
        validator: function (v) {
          // Validate YouTube URL format
          return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/.test(v);
        },
        message: "Please provide a valid YouTube URL",
      },
    },
    thumbnail: {
      type: String,
      default: function () {
        // Extract video ID and generate thumbnail URL
        const videoId = this.extractVideoId(this.youtubeUrl);
        return videoId
          ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
          : "";
      },
    },
    game: {
      type: String,
      required: true,
      enum: [
        "Valorant",
        "CS2",
        "PUBG Mobile",
        "Dota 2",
        "League of Legends",
        "Free Fire",
        "Mobile Legends",
        "Apex Legends",
        "Call of Duty",
        "Rainbow Six Siege",
        "Other",
      ],
    },
    tournament: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tournament",
      required: true,
    },
    tournamentName: {
      type: String,
      required: true,
      trim: true,
    },
    organizer: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "organizerModel",
    },
    organizerModel: {
      type: String,
      required: true,
      enum: ["User", "OrganizationAccount"],
      default: "OrganizationAccount",
    },
    organizerName: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["scheduled", "live", "completed"],
      default: "scheduled",
    },
    startTime: {
      type: Date,
      required: true,
    },
    endTime: {
      type: Date,
    },
    viewers: {
      type: Number,
      default: 0,
    },
    isNepal: {
      type: Boolean,
      default: true,
    },
    isApproved: {
      type: Boolean,
      default: false,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    approvedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Method to extract YouTube video ID from URL
streamSchema.methods.extractVideoId = function (url) {
  const regExp =
    /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
};

// Method to get embed URL
streamSchema.methods.getEmbedUrl = function () {
  const videoId = this.extractVideoId(this.youtubeUrl);
  return videoId ? `https://www.youtube.com/embed/${videoId}` : "";
};

// Virtual: iframe-ready embed URL, included in every JSON response.
// Methods get stripped during serialization, so the frontend needs this.
streamSchema.virtual("embedUrl").get(function () {
  if (!this.youtubeUrl) return "";
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = this.youtubeUrl.match(regExp);
  const videoId = match && match[2].length === 11 ? match[2] : null;
  return videoId ? `https://www.youtube.com/embed/${videoId}` : "";
});

// Method to update status based on time
streamSchema.methods.updateStatus = function () {
  const now = new Date();
  if (this.startTime > now) {
    this.status = "scheduled";
  } else if (this.endTime && this.endTime < now) {
    this.status = "completed";
  } else {
    this.status = "live";
  }
  return this.status;
};

// Index for faster queries
streamSchema.index({ status: 1, startTime: -1 });
streamSchema.index({ game: 1, status: 1 });
streamSchema.index({ organizer: 1 });
streamSchema.index({ isApproved: 1 });

module.exports = mongoose.model("Stream", streamSchema);
