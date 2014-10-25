///<reference path='../../../lib/node.d.ts'/>
'use strict';

var https = require('https');
var config = require('config');
var mongoose = require('mongoose');
var schema = require('../schema');
var csv = require('csv');
var Q = require('q');
var sendgrid = require('sendgrid')(
  process.env.SENDGRID_USERNAME || config.development.sendgrid.userName,
  process.env.SENDGRID_PASSWORD || config.development.sendgrid.password
);

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

/**
 * エラー処理
 * @param {type} err Errorオブジェクト
 */
function onError(err) {
  console.log(err.stack);
  process.exitCode = 1;

  sendgrid.send({
    to: config.errorReportMailAddress,
    from: config.errorReportMailAddress,
    subject: 'mobamas-dojo-serverエラー報告',
    text: err.stack
  }, function(err/*, json*/) {
    console.log(err.stack);
  });
}

/**
 * DBから切断する
 * @returns {Q.Promise} Q.Promise
 */
function disconnectDB() {
  console.log('disconnectDB');
  return Q.ninvoke(mongoose, 'disconnect');
}

/**
 * 道場リストをDBへ保存する
 * @param {object} dojoList 道場リストのオブジェクト
 * @returns {Q.Promise} Q.Promise
 */
function saveDB(dojoList) {
  console.log('saveDB');
  return Q.ninvoke(dojoList, 'save');
}

/**
 * 道場リストをDBから削除する
 * @param {object} db mongooseのconnectionがラッピングされた物
 * @param {object} dojos 道場リストのオブジェクトがラッピングされた物
 * @returns {Q.Promise} Q.Promise
 */
function removeDB(db, dojos) {
  console.log('removeDB');
  var deferred = Q.defer();

  // DojoListスキーマモデル生成
  var DojoLists = db.value.model('DojoLists', schema.DojoListSchema);

  // 全削除
  DojoLists.remove({}, function(err) {
    if (err) {
      deferred.reject(err);
    }
    else {
      console.log('removeDB finished');

      // 新しい道場リスト
      var dojoList = new DojoLists();
      dojoList.json = JSON.stringify(dojos.value);

      // 次の処理へdojoListを渡す
      deferred.resolve(dojoList);
    }
  });

  return deferred.promise;
}

/**
 * DBへ接続する
 */
function connectDB() {
  console.log('connectDB');
  var deferred = Q.defer();

  // mongoDBサーバー接続
  var db = mongoose.createConnection(process.env.MONGOHQ_URL || config.development.mongoURL);

  // 接続完了
  db.on('connected', function() {
    // 次の処理へdbを渡す
    deferred.resolve(db);
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

    // 次の処理へdojosを渡す
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
      data += chunk;
    });

    // データ受信完了
    res.on('end', function() {
      console.log('downloadCSV end');
      // 次の処理へdataを渡す
      deferred.resolve(data);
    });
  });

  // タイムアウトを設定
  req.setTimeout(config.downloadTimeout);

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
  .then(function(csv) {
    return Q.allSettled([ connectDB(), transformCSV(csv) ]);
  })
  .spread(removeDB)
  .then(saveDB)
  .finally(disconnectDB)
  .catch(onError)
  .done();