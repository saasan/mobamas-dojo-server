///<reference path='../lib/node.d.ts'/>
'use strict';

var mongoose = require('mongoose');
var Schema = mongoose.Schema;

// DojoListスキーマ定義
module.exports.DojoListSchema = new Schema({
  json: { type: String, required: true }
});