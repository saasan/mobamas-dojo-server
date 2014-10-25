# モバマス道場リスト(サーバー)

##設定

- `process.env.NODE_ENV`  
  productionに設定すると本番モード

- `process.env.ERROR_REPORT_MAIL_ADDRESS`  
  エラー報告用メールアドレス

##設定方法

- heroku上なら `heroku config:set NODE_ENV=production`
- ローカルなら config/local.json を読み込むので設定不要