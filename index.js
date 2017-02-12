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
    return line.length ? parseInt(line.match(/^\s*/)[0].length, 10) : 9999;
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
 * @returns {Array|*|{}}
 */
function raiseIndent(lines, offset) {
    offset = offset || '    ';

    return lines.map((line) => offset + line);
}

/**
 * Formalize any given value as wrap object
 *
 * @param wrap
 * @returns {{before: '', after: ''}}
 */
function formalizeWrap(wrap) {
    const result = {before: '', after: ''};

    if ((typeof wrap === 'string' && wrap.length > 0) || typeof wrap === 'number') {
        result.before = result.after = wrap;
    } else if (Array.isArray(wrap) && wrap.length > 0) {
        result.before = [].slice.call(wrap, 0, 1)[0];
        result.after = wrap.length > 1 ? [].slice.call(wrap, 1, 2)[0] : result.before;
    } else if (_.isPlainObject(wrap)) {
        let i = 0;

        // crappy method getting the value of the first and second item in object
        for (let el in wrap) {
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
 * e.g.: <!-- extract:content/element.html wrap:<div class="wrapper-element">:</div> -->
 * becomes:
 * {
 *   extract: 'content/element.html',
 *   wrap: {before: '<div class="wrapper-element">', after: '</div>'}
 * }
 *
 * @param annotation
 * @param defaults
 * @returns {{}}
 */
function getBlockOptions(annotation, defaults) {
    const optionValues = annotation.split(/\w+\:/)
        .map((item) => item.replace(/<!--\s?|\s?-->|^\s+|\s+$/, ''))
        .filter((item) => !!item.length);
    const optionKeys = annotation.match(/(\w+)\:/gi).map((item) => item.replace(/[^\w]/, ''));

    defaults = defaults || {
            wrap: {before: '', after: ''}
        };

    const opts = {};

    optionValues.forEach((v, i) => {
        const k = optionKeys[i];

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
    opts.wrap = formalizeWrap(opts.wrap || defaults.wrap);

    return opts;
}

/**
 * trim given number of leading characters
 *
 * @param lines
 * @param num Number of chars to be removed
 * @returns Array
 */
function trimLines(lines, num) {
    return lines.map((line) => line.substr(num));
}

/**
 * create sha1 hash from string
 *
 * @param value
 * @returns {*}
 */
function createId(value) {
    return crypto.createHash('sha1').update(value, 'utf8').digest('hex').slice(0, 8);
}

/**
 * get default options, scope as function instead of "public" property
 *
 * @returns {{indent: string, origin: string, resources: {classnames: {root: string, body: string}, meta: Array, scriptsFoot: {files: Array, inline: Array}, scriptsHead: {files: Array, inline: Array}, stylesHead: {files: Array, inline: Array}}, wrap: {before: string, after: string}}}
 */
function getDefaultOptions() {
    const resources = {
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
        wrap: { before: '', after: '' }
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
    data = data || {};

    this.category = data.hasOwnProperty('category') ? data.category : 'No category';
    this.id = data.hasOwnProperty('id') ? data.id : '';
    this.group = data.hasOwnProperty('group') ? data.group : '';
    this.lines = data.hasOwnProperty('lines') ? data.lines : 0;
    this.name = data.hasOwnProperty('name') ? data.name : '';
    this.options = data.hasOwnProperty('options') ? data.options : {};
    this.origin = data.hasOwnProperty('origin') ? data.origin : '';
    this.resources = data.hasOwnProperty('resources') ? data.resources : Object.assign({}, getDefaultOptions().resources);
    this.usage = data.hasOwnProperty('usage') ? data.usage : [];
    this.viewId = data.hasOwnProperty('viewId') ? data.viewId : '';
};

/**
 * parse data from extracted part
 *
 * @param src
 * @param opts
 */
InventoryObject.prototype.parseData = function (src, opts) {
    opts = Object.assign({}, getDefaultOptions(), opts);

    // remove ending annotation <!-- endextract -->
    src = src.replace(/<!--([\s\n]+)?(endextract)(.|\n)*?-->/gi, '')

    const parts = src.match(/(?:<!--)?\s*((?:.|\n)*?)-->((?:.|\n)*?)/i);
    const blockOpts = getBlockOptions(parts[1], opts);

    // remove extraction annotation and trim
    const content = _.trimEnd(_.trimStart(src.replace(/<!--([\s\n]+)?(extract)(.|\n)*?-->/gi, ''), '\n\r'));

    // continue if name is empty
    if (!blockOpts.hasOwnProperty('extract')) {
        return;
    }

    // label from name property and fallback to extract value
    const name = blockOpts.hasOwnProperty('name') ? blockOpts.name : blockOpts.extract;

    // set category name
    const category = blockOpts.hasOwnProperty('category') ? blockOpts.category : this.category;

    // set group
    const group = blockOpts.hasOwnProperty('group') ? blockOpts.group : this.group;

    // process source code
    let lines = content.split('\n')
        .map((line) => _.trimEnd(line))
        .map((line) => properIndentation(line, opts.indent));
    const leadingWhitespace = lines.map(countWhitespace);
    const crop = leadingWhitespace.reduce(getLeadingWhitespace);

    lines = trimLines(lines, crop);

    // set properties
    this.category = category;
    this.group = group;
    // remove all whitespace chars before creating the hash
    this.id = createId(src.replace(/\s+/gi, ''));
    this.lines = lines;
    this.name = name;
    this.options = blockOpts;
    this.resources = opts.resources;
    this.viewId = createId(this.lines.join('').replace(/\s+/gi, ''));
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
