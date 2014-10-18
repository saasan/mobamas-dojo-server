#!/usr/bin/env node
'use strict';

var https = require('https');
var config = require('config');
var mongoose = require('mongoose');
var schema = require('../schema');
var csv = require('csv');

process.on('exit', function() {
  console.log('exit');
});

function saveDB(db, dojos) {
  console.log('saveDB');

  // DojoListスキーマモデル生成
  var DojoLists = db.model('DojoLists', schema.DojoListSchema);

  // 全削除
  console.log('remove DB started');
  DojoLists.remove({}, function(err) {
    if (err) {
      console.log('remove DB error: ' + err.message);
    }
    else {
      console.log('remove DB finished');

      // 保存
      console.log('save DB started');
      var dojo = new DojoLists();
      dojo.json = JSON.stringify(dojos);
      dojo.save(function(err) {
        if (err) {
          console.log('save DB error: ' + err.message);
        }
        else {
          console.log('save DB finished');
        }
      });
    }
  });

  db.close(function() {
    console.log('mongoose.connection.close');
  });
}

function connectDB(dojos) {
  console.log('connectDB');

  // mongoDBサーバー接続
  var db = mongoose.createConnection(process.env.MONGOHQ_URL || config.development.mongoURL);

  // 接続完了
  db.on('connected', function() {
    // 保存
    saveDB(db, dojos);
  });

  // エラー時の処理
  db.on('error', function(err) {
    console.log('mongoose.createConnection error: ' + err.message);
  });
}

/**
 * CSVファイルを加工する
 * @param {string} data CSVファイルの中身
 */
function transformCSV(data) {
  console.log('transformCSV');

  // CSVの列
  var COLUMNS;
  (function(COLUMNS) {
    COLUMNS[COLUMNS.UNUSED = 0] = 'UNUSED';
    COLUMNS[COLUMNS.LV = 1] = 'LV';
    COLUMNS[COLUMNS.RANK = 2] = 'RANK';
    COLUMNS[COLUMNS.ID = 3] = 'ID';
    COLUMNS[COLUMNS.TYPE = 4] = 'TYPE';
    COLUMNS[COLUMNS.LINK = 5] = 'LINK';
    COLUMNS[COLUMNS.CHEER = 6] = 'CHEER';
    COLUMNS[COLUMNS.LEADER = 7] = 'LEADER';
    COLUMNS[COLUMNS.DEFENSE = 8] = 'DEFENSE';
    COLUMNS[COLUMNS.COMMENT = 9] = 'COMMENT';
    COLUMNS[COLUMNS.NO = 10] = 'NO';
    COLUMNS[COLUMNS.LAST_UPDATE = 11] = 'LAST_UPDATE';
    COLUMNS[COLUMNS.REPEATED = 12] = 'REPEATED';
  })(COLUMNS || (COLUMNS = {}));

  var dojos = [];
  var parser = csv.parse();

  // 各行が読み込めるようになったらオブジェクト化して配列へ入れる
  parser.on('readable', function() {
    for (var record = parser.read(); record; record = parser.read()) {
      if (record[COLUMNS.LV] === '' || record[COLUMNS.RANK] === '' || record[COLUMNS.ID] === '' || record[COLUMNS.REPEATED] === '重複') {
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
    console.log('parse error: ' + err.message);
  });

  // パース完了
  parser.on('finish', function() {
    console.log('parse finish');
    console.log(JSON.stringify(dojos));

    connectDB();
  });

  // パース開始
  parser.write(data);
  parser.end();

}

/**
 * CSVファイルをダウンロードする
 */
function downloadCSV() {
  console.log('downloadCSV');

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
      transformCSV(data);
    });
  });

  // ミリ秒でタイムアウトを設定
  req.setTimeout(60 * 1000);

  // タイムアウト時の処理
  req.on('timeout', function() {
    console.log('downloadCSV request timed out');
    req.abort();
    process.exitCode = 1;
  });

  // エラー時の処理
  req.on('error', function(err) {
    console.log('downloadCSV error: ' + err.message);
    process.exitCode = 1;
  });
}

downloadCSV();