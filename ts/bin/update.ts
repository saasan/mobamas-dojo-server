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
var dateFormat = require('dateformat');

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

// ランク
enum RANK {
  F,
  E,
  D,
  C,
  B,
  A,
  S,
  SS,
  S3,
  S4,
  S5
};

/**
 * エラー処理
 * @param {Error} err Errorオブジェクト
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
      var lastUpdate = dateFormat(new Date(), 'yyyy-mm-dd HH:MM:ss');
      dojoList.json = JSON.stringify({ lastUpdate: lastUpdate, dojos: dojos.value });

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
 * 全角を半角に変換
 * @param {string} str 全角を含む文字列
 * @returns {string} 半角化した文字列
 */
function fullToHalf(str: string): string {
  var delta = '０'.charCodeAt(0) - '0'.charCodeAt(0);
  return str.replace(/[０-９ａ-ｚＡ-Ｚ]/g, function(c) {
    return String.fromCharCode(c.charCodeAt(0) - delta);
  });
}

/**
 * 守発揮値の文字列から、最低守発揮値を数値として取り出す
 * @param {string} defence CSVから取り出した守発揮値の文字列
 * @returns {number} 最低守発揮値。数字が無い場合はnullを返す。
 */
function getMinDefence(defence: string): number {
  // 一番左にある数値がおそらく最低守発揮値
  var re = /^[^0-9０-９]*([0-9０-９.]+)/;

  // 数字が無い場合は0を返す
  if (!re.test(defence)) {
    return null;
  }

  // 数字部分を取り出して半角に変換する
  var minDefenceString: string = defence.replace(re, '$1');
  minDefenceString = fullToHalf(minDefenceString);

  // 数値化
  var minDefence: number = parseFloat(minDefenceString);

  // 数が小さい場合は「5k」等の表記と思われるので1000倍する
  if (minDefence < 100) {
    minDefence *= 1000;
  }

  // 小数点以下を切り捨てて返す
  return Math.floor(minDefence);
}

/**
 * recordから道場のデータを作成する
 * @param {any} record CSVファイルのrecord
 * @returns {any} 道場のデータ
 */
function createDojo(record) {
  var rank, minDefense;
  // 文字列の長さが0以上なら追加する物
  var checkLength = {
    leader: COLUMN.LEADER,
    defense: COLUMN.DEFENSE
  };

  var dojo: any = {
    lv : parseInt(record[COLUMN.LV], 10),
    id : parseInt(record[COLUMN.ID], 10)
  };

  // ランクを数値化して追加
  rank = record[COLUMN.RANK].replace(/\./g, '');
  if (RANK[rank] != null) {
    dojo.rank = RANK[rank];
  }

  // 文字列の長さが0以上なら追加
  Object.keys(checkLength).forEach(function(key) {
    if (record[checkLength[key]].length > 0) {
      dojo[key] = record[checkLength[key]];
    }
  });

  // 最低守発揮値を取得
  minDefense = getMinDefence(record[COLUMN.DEFENSE]);
  // 最低守発揮値があれば追加
  if (minDefense != null) {
    dojo.minDefense = minDefense;
  }

  return dojo;
}

/**
 * 道場に番号を振る
 * @param {array} dojos 道場データの配列
 */
function addDojoNumber(dojos) {
  var i;

  // ランク降順(ランクが同じならレベル降順)でソート
  dojos.sort(function(a, b) {
    var result = b.rank - a.rank;

    if (result === 0) {
      result = b.lv - a.lv;
    }

    return result;
  });

  // ランク順の道場番号を振る
  for (i = 0; i < dojos.length; i++) {
    dojos[i].rankNo = i + 1;
  }

  // レベル降順(レベルが同じならランク降順)でソート
  dojos.sort(function(a, b) {
    var result = b.lv - a.lv;

    if (result === 0) {
      result = a.rankNo - b.rankNo;
    }

    return result;
  });

  // レベル順の道場番号を振る
  for (i = 0; i < dojos.length; i++) {
    dojos[i].lvNo = i + 1;
  }

  return dojos;
}

/**
 * CSVファイルを加工する
 * @param {string} data CSVファイルの中身
 */
function transformCSV(data) {
  console.log('transformCSV');
  var deferred = Q.defer();

  var dojo, dojos = [];
  var record, parser = csv.parse();
  // 各行が読み込めるようになったらオブジェクト化して配列へ入れる
  parser.on('readable', function() {
    for (record = parser.read(); record; record = parser.read()) {
      if (record[COLUMN.LV] === '' || record[COLUMN.RANK] === '' ||
          record[COLUMN.ID] === '' || record[COLUMN.REPEATED] === '重複') {
        continue;
      }

      dojo = createDojo(record);
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

    // 道場に番号を振る
    dojos = addDojoNumber(dojos);

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

      // データの長さを確認
      if (data.length > 0) {
        // 次の処理へdataを渡す
        deferred.resolve(data);
      }
      else {
        deferred.reject(new Error('no CSV data'));
      }
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
