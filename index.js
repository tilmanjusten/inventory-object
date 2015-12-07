'use strict';

var _ = require('lodash');
var util = require('util');
var os = require('os');
var crypto = require('crypto');

/**
 * replace tabs by indent value
 *
 * @param line
 * @param indent
 * @return string
 */
function properIndentation(line, indent) {
    return line.replace(/\t/, indent || '');
}

/**
 * count leading whitespace chars
 *
 * @param line
 * @return integer
 */
function countWhitespace(line) {
    // return a somewhat high value for empty lines
    return line.length ? line.match(/^\s*/)[0].length : 9999;
}

/**
 * get lowest value of leading whitespace in a given block
 *
 * @param previous
 * @param current
 * @returns integer
 */
function getLeadingWhitespace(previous, current) {
    return previous <= current ? previous : current;
}

/**
 * raise offset in lines
 *
 * @param lines
 * @param offset
 * @returns {Array}
 */
function raiseIndent(lines, offset) {
    offset = offset || '    ';

    return lines.map(function (line) {
        return offset + line;
    });
}

/**
 * Formalize any given value as wrap object
 *
 * @param wrap
 * @returns {{before: '', after: ''}}
 */
function formalizeWrap(wrap) {
    var result = {before: '', after: ''};

    if ((typeof wrap === 'string' && wrap.length > 0) || typeof wrap === 'number') {
        result.before = result.after = wrap;
    } else if  (Array.isArray(wrap) && wrap.length > 0) {
        result.before = [].slice.call(wrap, 0, 1)[0];
        result.after = wrap.length > 1 ? [].slice.call(wrap, 1, 2)[0] : result.before;
    } else if (_.isPlainObject(wrap)) {
        var i = 0;
        var el;

        // crappy method getting the value of the first and second item in object
        for (el in wrap) {
            if (!wrap.hasOwnProperty(el)) {
                continue;
            }

            if (i < 2) {
                result.before = wrap[el];
            }

            i++;
        }

        // set value of after to the value of before if after is empty
        result.after = result.after.length < 1 ? result.before : result.after;
    }

    return result;
}

/**
 * read options from annotation
 *
 * e.g.: <!-- extract:teaser/content-teaser--small.html wrap:<div class="teaser-list teaser-list--small">:</div> -->
 * gets:
 * {
     *   extract: 'teaser/content-teaser--small.html',
     *   viewWrap: {before: '<div class="teaser-list teaser-list--small">', after: '</div>'}
     * }
 *
 * @param annotation
 * @param defaults
 * @returns {{}}
 */
function getBlockOptions(annotation, defaults) {
    var optionValues = annotation.split(/\w+:/).map(function (item) {
        return item.replace(/<!--\s?|\s?-->|^\s+|\s+$/, '');
    }).filter(function (item) {
        return !!item.length;
    });
    var optionKeys = annotation.match(/(\w+):/g).map(function (item) {
        return item.replace(/[^\w]/, '');
    });

    defaults = defaults || {
            viewWrap: {before: '', after: ''}
        };

    var opts = {};

    optionValues.forEach(function (v, i) {
        var k = optionKeys[i];

        if (typeof k !== 'string') {
            return;
        }

        // Treat option value as array if it has a colon
        // @todo: Allow escaped colons to be ignored
        // RegEx lookbehind negate does not work :(
        // Should be /(?<!\\):/
        if (v.indexOf(':') > -1) {
            v = v.split(':');
        }

        opts[k] = v;
    });

    // Process options
    opts.wrap = formalizeWrap(opts.wrap || defaults.viewWrap);

    return opts;
}

/**
 * Format options as string of HTML data parameters
 *
 * @param options
 * @returns {string}
 */
function optionsToDataString(options) {
    if (typeof options !== 'object') {
        return '';
    }

    var prepared = [];
    var el;
    var processedOptions = _.assign({}, options);

    // prepare wrap option
    if (processedOptions.hasOwnProperty('wrap')) {
        processedOptions['wrap-before'] = processedOptions.wrap.before;
        processedOptions['wrap-after'] = processedOptions.wrap.after;

        delete(processedOptions.wrap);
    }

    // create data attributes
    for (el in processedOptions) {
        if (processedOptions.hasOwnProperty(el) === false) {
            continue;
        }

        var value = processedOptions[el];
        var preparedVal = JSON.stringify(processedOptions[el]);
        var param = '';

        // Ignore callbacks
        if (typeof value === 'function') {
            continue;
        }

        // Cleanup: Remove leading and trailing " and ', replace " by ' (e.g. in stringified objects)
        preparedVal = preparedVal.replace(/^['"]|['"]$/g, '').replace(/\\?"/g, "'");

        // Build data parameter: data-name="value"
        param = 'data-' + el + '="' + preparedVal + '"';

        prepared.push(param);
    }

    return prepared.join(' ');
}

/**
 * trim given number of leading characters
 *
 * @param lines
 * @param num Number of chars to be removed
 * @returns Array
 */
function trimLines(lines, num) {
    return lines.map(function (line) {
        return line.substr(num);
    });
}

/**
 * create sha1 hash from string
 *
 * @param value
 * @returns {*}
 */
function createId(value) {
    return crypto.createHash('sha1').update(value, 'utf8').digest('hex')
}

/**
 * get default options, scope as function instead of "public" property
 *
 * @returns {{indent: string, origin: string, resources: {classnames: {root: string, body: string}, meta: Array, scriptsFoot: {files: Array, inline: Array}, scriptsHead: {files: Array, inline: Array}, stylesHead: {files: Array, inline: Array}}, templateWrap: {before: string, after: string}, viewWrap: {before: string, after: string}}}
 */
function getDefaultOptions() {
    var resources = {
        classnames: {
            root: '',
            body: ''
        },
        meta: [],
        scriptsFoot: {
            files: [],
            inline: []
        },
        scriptsHead: {
            files: [],
            inline: []
        },
        stylesHead: {
            files: [],
            inline: []
        }
    };

    return {
        indent: '    ',
        origin: '',
        resources: resources,
        templateWrap: { before: '', after: '' },
        viewWrap: { before: '', after: '' }
    }
}

/**
 * Constructor
 *
 * Use named function to get better backtraces in node
 *
 * @param data
 * @constructor
 */
var InventoryObject = function (data) {
    data                = data || {};

    this.category       = data.hasOwnProperty('category') ? data.category : 'No category';
    this.id             = data.hasOwnProperty('id') ? data.id : '';
    this.group          = data.hasOwnProperty('group') ? data.group : '';
    this.lines          = data.hasOwnProperty('lines') ? data.lines : 0;
    this.name           = data.hasOwnProperty('name') ? data.name : '';
    this.options        = data.hasOwnProperty('options') ? data.options : {};
    this.optionsData    = data.hasOwnProperty('optionsData') ? data.optionsData : '';
    this.origin         = data.hasOwnProperty('origin') ? data.origin : '';
    this.partial        = data.hasOwnProperty('partial') ? data.partial : '';
    this.resources      = data.hasOwnProperty('resources') ? data.resources : _.assign({}, getDefaultOptions().resources);
    this.template       = data.hasOwnProperty('template') ? data.template : '';
    this.usage          = data.hasOwnProperty('usage') ? data.usage : [];
    this.view           = data.hasOwnProperty('view') ? data.view : '';
    this.viewId         = data.hasOwnProperty('viewId') ? data.viewId : '';
};

/**
 * parse data from extracted part
 *
 * @param src
 * @param opts
 */
InventoryObject.prototype.parseData = function(src, opts) {
    opts = _.assign({}, getDefaultOptions(), opts);

    var parts = src.match(/<!--\s*((?:.|\n)*?)-->((?:.|\n)*?)<!--\s*endextract\s*-->/i);
    var blockOpts = getBlockOptions(parts[1], opts);
    var content = _.trimRight(_.trimLeft(parts[2], '\n\r'));
    var category;
    var name;
    var group;

    // continue if name is empty
    if (!blockOpts.hasOwnProperty('extract')) {
        return;
    }

    // label from name property and fallback to extract value
    name = blockOpts.hasOwnProperty('name') ? blockOpts.name : blockOpts.extract;

    // set category name
    category = blockOpts.hasOwnProperty('category') ? blockOpts.category : this.category;

    // set group
    group = blockOpts.hasOwnProperty('group') ? blockOpts.group : this.group;

    // process source code
    var lines = content.split('\n').map(function(line) {
        // remove possibly existing CR
        return _.trimRight(line);
    }).map(function (line) {
        return properIndentation(line, opts.indent);
    });
    var leadingWhitespace = lines.map(countWhitespace);
    var crop = leadingWhitespace.reduce(getLeadingWhitespace);
    var viewWrap = blockOpts.wrap;
    var templateWrapOptions = optionsToDataString(blockOpts);

    lines = trimLines(lines, crop);

    var viewLines = util._extend([], lines);
    var templateLines = util._extend([], lines);

    // wrap partial if inline option viewWrap: exists
    if (viewWrap.before.length) {
        viewLines = raiseIndent(viewLines);
        viewLines.unshift('');
        viewLines.unshift(viewWrap.before);
        viewLines.push('');
        viewLines.push(viewWrap.after);
    }

    // add templateWrap
    if (typeof opts.templateWrap === 'object') {
        var before = opts.templateWrap.before || '';
        var after = opts.templateWrap.after || '';

        before = before.replace('{{wrapData}}', templateWrapOptions);
        after = after.replace('{{wrapData}}', templateWrapOptions);

        templateLines.unshift(before);
        templateLines.push(after);
    }

    // set properties
    this.category       = category;
    this.group          = group;
    // remove all whitespace chars before creating the hash
    this.id             = createId(src.replace(/\s+/gi, ''));
    this.lines          = lines;
    this.name           = name;
    this.options        = blockOpts;
    this.optionsData    = templateWrapOptions;
    this.partial        = lines.join(os.EOL);
    this.resources      = opts.resources;
    this.template       = templateLines.join(os.EOL);
    this.view           = viewLines.join(os.EOL);
    this.viewId         = createId(this.view.replace(/\s+/gi, ''));
};

/**
 * set inventory object property if prop is a valid property name (property exists)
 *
 * @param prop
 * @param value
 * @returns {boolean}
 */
InventoryObject.prototype.setProperty = function (prop, value) {
    if (typeof prop !== 'string' || !this.hasOwnProperty(prop)) {
        return false;
    }

    this[prop] = value;

    return true;
};



/**
 * module
 * @param data
 * @returns {*}
 */
module.exports = InventoryObject;