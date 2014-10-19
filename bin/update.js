#!/usr/bin/env node
'use strict';

var https = require('https');
var config = require('config');
var mongoose = require('mongoose');
var schema = require('../schema');
var csv = require('csv');
var Q = require('q');

/**
 * エラー処理
 * @param {type} err Errorオブジェクト
 */
function onError(err) {
  console.log(err.stack);
  process.exitCode = 1;
}

/**
 * DBから切断する
 * @returns {type} Q.Promise
 */
function disconnectDB() {
  console.log('disconnectDB');
  return Q.ninvoke(mongoose, 'disconnect');
}

function saveDB(dojo) {
  console.log('saveDB');
  return Q.ninvoke(dojo, 'save');
}

function removeDB(args) {
  var deferred = Q.defer();

  // DojoListスキーマモデル生成
  var DojoLists = args.db.model('DojoLists', schema.DojoListSchema);

  // 全削除
  console.log('remove DB started');
  DojoLists.remove({}, function(err) {
    if (err) {
      deferred.reject(err);
    }
    else {
      console.log('remove DB finished');

      // 新しい道場
      var dojo = new DojoLists();
      dojo.json = JSON.stringify(args.dojos);

      deferred.resolve(dojo);
    }
  });

  return deferred.promise;
}

function connectDB(dojos) {
  console.log('connectDB');
  var deferred = Q.defer();

  // mongoDBサーバー接続
  var db = mongoose.createConnection(process.env.MONGOHQ_URL || config.development.mongoURL);

  // 接続完了
  db.on('connected', function() {
    deferred.resolve({ db: db, dojos: dojos });
  });

  // 切断
  db.on('disconnected', function() {
    console.log('disconnected');
  });

  // エラー時の処理
  db.on('error', function(err) {
    deferred.reject(err);
  });

  return deferred.promise;
}

/**
 * CSVファイルを加工する
 * @param {string} data CSVファイルの中身
 */
function transformCSV(data) {
  console.log('transformCSV');
  var deferred = Q.defer();

  // CSVの列
  var COLUMNS = {
    UNUSED: 0,
    LV: 1,
    RANK: 2,
    ID: 3,
    TYPE: 4,
    LINK: 5,
    CHEER: 6,
    LEADER: 7,
    DEFENSE: 8,
    COMMENT: 9,
    NO: 10,
    LAST_UPDATE: 11,
    REPEATED: 12
  };

  var dojos = [];
  var parser = csv.parse();

  // 各行が読み込めるようになったらオブジェクト化して配列へ入れる
  parser.on('readable', function() {
    for (var record = parser.read(); record; record = parser.read()) {
      if (record[COLUMNS.LV] === '' || record[COLUMNS.RANK] === '' ||
          record[COLUMNS.ID] === '' || record[COLUMNS.REPEATED] === '重複') {
        continue;
      }

      var dojo = {
        lv : parseInt(record[COLUMNS.LV], 10),
        rank : record[COLUMNS.RANK].replace(/\./g, ''),
        id : parseInt(record[COLUMNS.ID], 10),
        leader : record[COLUMNS.LEADER],
        defense : record[COLUMNS.DEFENSE]
      };
      dojos.push(dojo);
    }
  });

  // エラー時の処理
  parser.on('error', function(err) {
    deferred.reject(err);
  });

  // パース完了
  parser.on('finish', function() {
    console.log('parse finish');
    console.log(JSON.stringify(dojos));

    deferred.resolve(dojos);
  });

  // パース開始
  parser.write(data);
  parser.end();

  return deferred.promise;
}

/**
 * CSVファイルをダウンロードする
 */
function downloadCSV() {
  console.log('downloadCSV');
  var deferred = Q.defer();

  var req = https.get(config.sourceURL, function(res) {
    var data = '';

    // テキストファイルの場合はUTF-8にしておく
    res.setEncoding('utf8');

    // データが何回か送られてくるので繋ぎ合わせる
    res.on('data', function(chunk) {
      console.log('downloadCSV data');
      data += chunk;
    });

    // データ受信完了
    res.on('end', function() {
      console.log('downloadCSV end');
      deferred.resolve(data);
    });
  });

  // ミリ秒でタイムアウトを設定
  req.setTimeout(60 * 1000);

  // タイムアウト時の処理
  req.on('timeout', function() {
    req.abort();
    deferred.reject(new Error('request timed out'));
  });

  // エラー時の処理
  req.on('error', function(err) {
    deferred.reject(err);
  });

  return deferred.promise;
}

downloadCSV()
  .then(transformCSV)
  .then(connectDB)
  .then(removeDB)
  .then(saveDB)
  .finally(disconnectDB)
  .catch(onError)
  .done();