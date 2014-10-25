///<reference path='../typings/node/node.d.ts'/>
///<reference path='../typings/mongoose/mongoose.d.ts'/>
'use strict';

import express = require('express');
var app: Express = express();

import config = require('config');
import mongoose = require('mongoose');
import schema = require('./schema');

// 本番環境かどうかのフラグ
// heroku config:set NODE_ENV=production
// NODE_ENV=production node app.js
var production: boolean = (process.env.NODE_ENV === 'production');

// ポートの設定
app.set('port', process.env.PORT || config.development.port);

// mongoDBサーバー接続
mongoose.connect(process.env.MONGOHQ_URL || config.development.mongoURL);
var db: Connection = mongoose.connection;

// DojoListスキーマモデル生成
var DojoLists: Model = db.model('DojoLists', schema.DojoListSchema);

// CORS(Cross-Origin Resource Sharing)の設定
app.all('*', function(req: any, res: any, next: Function): any {
  // 本番環境の場合はアクセス元を制限
  if (production) {
    res.header('Access-Control-Allow-Origin', config.accessControlAllowOrigin);
  }
  else {
    res.header('Access-Control-Allow-Origin', '*');
  }
  // X-Requested-Withヘッダを許可する
  // X-Requested-WithヘッダはjQueryやprototype.jsでは自動的に設定してくれる
  // X-Requested-Withヘッダが"XMLHttpRequest"でなければ直接アクセスしてる
  res.header('Access-Control-Allow-Headers', 'X-Requested-With');
  next();
});

app.get('/', function(req: any, res: any, next: Function): any {
  // 本番環境でX-Requested-Withヘッダが"XMLHttpRequest"でない場合
  if (production && !req.xhr) {
    // 403 Forbidden
    res.status(403).send('<h1>403 Forbidden</h1>').end();
    return;
  }

  DojoLists.findOne({}, function(err: any, dojoList: any): any {
    if (err) {
      return next(err);
    }

    // データが無い場合
    if (!dojoList) {
      // 普通は有り得ないので 500 Internal Server Error にしておく
      res.status(500).send('<h1>500 Internal Server Error</h1>').end();
      return;
    }

    res.type('application/json; charset=utf-8');
    res.send(dojoList.json);
  });
});

app.listen(app.get('port'));
