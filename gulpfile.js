'use strict';
var gulp = require('gulp');
var tsc = require('gulp-tsc');
var rimraf = require('rimraf');
var tslint = require('gulp-tslint');

var paths = {
  files: ['.gitignore', 'package.json', 'Procfile', 'config/*', 'bin/*'],
  ts: ['ts/*.ts', 'ts/bin/*.ts'],
  out: '../mobamas-dojo-server-release/'
};

gulp.task('clean', function() {
  rimraf.sync(paths.out);
});

gulp.task('copy', function() {
  gulp.src(paths.files, { base: './' })
    .pipe(gulp.dest(paths.out));
});

gulp.task('tslint', function() {
  gulp.src(paths.ts)
    .pipe(tslint())
    .pipe(tslint.report('verbose'));
});

gulp.task('ts', function() {
  gulp.src(paths.ts)
    .pipe(tsc({ removeComments: true }))
    .pipe(gulp.dest(paths.out));
});

gulp.task('watch', function() {
  gulp.watch(paths.ts.in, ['ts']);
});

gulp.task('compile', ['ts']);
gulp.task('release', ['clean', 'ts', 'copy']);
gulp.task('default', ['ts']);
