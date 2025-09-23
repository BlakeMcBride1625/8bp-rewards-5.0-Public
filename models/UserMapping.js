const mongoose = require('mongoose');

const userMappingSchema = new mongoose.Schema({
  discordId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  bpAccountId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  username: {
    type: String,
    required: true,
    trim: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  lastClaimed: {
    type: Date,
    default: null
  },
  totalClaims: {
    type: Number,
    default: 0
  }
});

// Update the updatedAt field before saving
userMappingSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Static method to find by Discord ID
userMappingSchema.statics.findByDiscordId = function(discordId) {
  return this.findOne({ discordId });
};

// Static method to find by 8BP Account ID
userMappingSchema.statics.findByBpAccountId = function(bpAccountId) {
  return this.findOne({ bpAccountId });
};

// Static method to get all users
userMappingSchema.statics.getAllUsers = function() {
  return this.find({}).sort({ createdAt: -1 });
};

// Instance method to update claim stats
userMappingSchema.methods.updateClaimStats = function() {
  this.lastClaimed = new Date();
  this.totalClaims += 1;
  return this.save();
};

const UserMapping = mongoose.model('UserMapping', userMappingSchema);

module.exports = UserMapping;
