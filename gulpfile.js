'use strict';
var gulp = require('gulp');
var tsc = require('gulp-tsc');
var rimraf = require('rimraf');

var paths = {
  files: ['.gitignore', 'package.json', 'Procfile', 'config/*', 'bin/*'],
  ts: 'ts/**/*.ts',
  out: '../mobamas-dojo-server-release/'
};

gulp.task('clean', function() {
  rimraf.sync(paths.out);
});

gulp.task('copy', function() {
  gulp.src(paths.files, { base: './' })
    .pipe(gulp.dest(paths.out));
});

gulp.task('ts', function() {
  gulp.src(paths.ts, { base: 'ts/' })
    .pipe(tsc({
      keepTree: false, // デフォルトのkeepTree: trueだとなぜかコンパイルできないので。
      removeComments: true
    }))
    .pipe(gulp.dest(paths.out));
});

gulp.task('watch', function() {
  gulp.watch(paths.ts.in, ['ts']);
});

gulp.task('compile', ['ts']);
gulp.task('release', ['clean', 'ts', 'copy']);
gulp.task('default', ['ts']);
