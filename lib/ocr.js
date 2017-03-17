/**
 * Module which extracts text from electronic searchable pdf files.
 * Requires the "pdftotext" binary be installed on the system and accessible in the
 * current path
 */
var temp = require('temp');
var path = require('path');
var exec = require('child_process').exec;
var fs = require('fs');
var _ = require('lodash');

/**
 * @param tif_path path to the single page file on disk containing a scanned image of text
 * @param {Array} options is an optional list of flags to pass to the tesseract command
 * @return {String} extract the extracted ocr text output
 * @return callback(<maybe error>, stdout)
 */
module.exports = function (input_path, options, callback) {
    // options is an optional parameter
    if (!callback || typeof callback != "function") {
        // callback must be the second parameter
        callback = options;
        options = [];
    }
    fs.exists(input_path, function (exists) {
        if (!exists) {
            return callback('error, no file exists at the path you specified: ' + input_path);
        }
        // get a temp output path
        var output_path = temp.path({prefix: 'ocr_output'});
        var parseTsv = false;
        // output_path = path.join(__dirname,'test/test_data/single_page_raw');
        var cmd = 'tesseract "' + input_path + '" "' + output_path + '" ' + options.join(' ');
        var child = exec(cmd, function (err, stdout, stderr) {
            if (err) {
                return callback(err);
            }
            console.log(output_path);

            // tesseract automatically appends ".txt" to the output file name
            var text_output_path = output_path + '.txt';
            if (options.indexOf("-c tessedit_create_tsv=1") > -1) {
                text_output_path = output_path + '.tsv';
                parseTsv = true;
            }
            // inspect(text_output_path, 'text output path');
            fs.readFile(text_output_path, 'utf8', function (err, output) {
                // inspect(output, 'ocr output');
                if (err) {
                    return callback(err);
                }

                if (parseTsv) {
                    var result = [];

                    var lines = output.split('\n');

                    _.each(lines, function (line) {
                        if (line.trim().length > 0) {
                            var element = line.split("\t");
                            if (element.length==12 && element[11].trim().length > 0 && element[11]!='text'
                                && parseInt(element[6]) > 0 && parseInt(element[7]) > 0) {
                                result.push({
                                    "words": element[11],
                                    "x": parseInt(element[6]),
                                    "y": parseInt(element[7]),
                                    "w": parseInt(element[8]),
                                    "h": parseInt(element[9])
                                });
                            }
                        }
                    });

                    lines = [];
                    _.each(result, function (char) {

                        var clustered = false;
                        _.each(lines, function (line) {

                            if (
                                (Math.abs(line.y - char.y) <= char.h * 0.5)
                            ) {
                                line.list.push(char);
                                clustered = true;
                            }
                        });

                        if (!clustered) {
                            lines.push({
                                "y": char.y,
                                "list": [char]
                            })
                        }
                    });

                    var resultLines = [];

                    _.each(lines, function (line) {

                        var words = [];

                        line.list = _.sortBy(line.list, ['x']);

                        _.each(line.list, function (char) {

                            var clustered = false;

                            _.each(words, function (word) {

                                if (
                                    (Math.abs((word.x + word.w) - char.x) <= (word.w / word.l) * 0.5)
                                ) {
                                    word.text += ' ' + char.words;
                                    word.l++;
                                    word.w +=
                                        ( char.x - (word.x + word.w) ) + // empty space width between word and this new character
                                        char.w;                    // character width
                                    clustered = true;
                                }
                            });

                            if (!clustered) {
                                words.push({
                                    "text": char.words,
                                    "x": char.x,
                                    "y": char.y,
                                    "w": char.w,
                                    "h": char.h,
                                    "l": 1
                                })
                            }
                        });

                        resultLines.push(
                            {
                                "line" : line.y,
                                "text" : words
                            }
                        );
                    });

                    output = resultLines;
                }
                // cleanup after ourselves
                fs.unlink(text_output_path, function (err) {
                    if (err) {
                        return callback(err);
                    }
                    callback(null, output);
                });
            });
        });
    });
}
