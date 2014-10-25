///<reference path='../typings/node/node.d.ts'/>
///<reference path='../typings/mongoose/mongoose.d.ts'/>
'use strict';

import mongoose = require('mongoose');
var Schema: Schema = mongoose.Schema;

// DojoListスキーマ定義
module.exports.DojoListSchema = new Schema({
  json: { type: String, required: true }
});
