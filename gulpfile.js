'use strict';
var del = require('del');
var gulp = require('gulp');
var tsc = require('gulp-tsc');
var tslint = require('gulp-tslint');

var paths = {
  files: [
    'bin/*',
    'config/*',
    '.gitignore',
    'package.json',
    'Procfile'
  ],
  ts: ['ts/*.ts', 'ts/bin/*.ts'],
  out: 'release/',
  clean: [
    'release/bin/*',
    'release/config/*',
    'release/.gitignore',
    'release/package.json',
    'release/Procfile',
    'release/*.js'
  ]
};

gulp.task('clean', del.sync.bind(null, paths.clean, { dot: true }));

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

gulp.task('help', function() {
  var tasks = Object.keys(gulp.tasks).sort();

  console.log('');
  tasks.forEach(function(name) {
    console.log('  ' + name);
  });
  console.log('');
});

gulp.task('compile', ['ts']);
gulp.task('release', ['clean', 'ts', 'copy']);
gulp.task('default', ['ts']);
