///<reference path='../../../typings/node/node.d.ts'/>
// ↑正しいパスは'../../typings/～'だけどなぜかコンパイルできないので。
'use strict';

var https = require('https');
var config = require('config');
var mongoose = require('mongoose');
var schema = require('../schema');
var csv = require('csv');
var Q = require('q');
var sendgrid = require('sendgrid');

// CSVの列
enum COLUMN {
  UNUSED,
  LV,
  RANK,
  ID,
  TYPE,
  LINK,
  CHEER,
  LEADER,
  DEFENSE,
  COMMENT,
  NO,
  LAST_UPDATE,
  REPEATED
};

/**
 * エラー処理
 * @param {type} err Errorオブジェクト
 */
function onError(err) {
  console.log(err.stack);

  var userName = process.env.SENDGRID_USERNAME || config.development.sendgrid.userName;
  var password = process.env.SENDGRID_PASSWORD || config.development.sendgrid.password;
  var mailAddress = process.env.ERROR_REPORT_MAIL_ADDRESS || config.errorReportMailAddress;

  var sender = new sendgrid.SendGrid(userName, password);
  var mail = new sendgrid.Email({
    to: mailAddress,
    from: mailAddress,
    subject: 'mobamas-dojo-serverエラー報告',
    text: err.stack
  });

  sender.send(mail, function(err/*, json*/) {
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
      if (record[COLUMN.LV] === '' || record[COLUMN.RANK] === '' ||
          record[COLUMN.ID] === '' || record[COLUMN.REPEATED] === '重複') {
        continue;
      }

      var dojo = {
        lv : parseInt(record[COLUMN.LV], 10),
        rank : record[COLUMN.RANK].replace(/\./g, ''),
        id : parseInt(record[COLUMN.ID], 10),
        leader : record[COLUMN.LEADER],
        defense : record[COLUMN.DEFENSE]
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
