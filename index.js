const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');
const generate = require('@babel/generator').default;
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const cssnano = require('cssnano');
const postcss = require('postcss');
const safeParser = require('postcss-safe-parser');
const pkg = require('./package.json');

let collectedStyles = []

function stripComments(code) {
    let result = ''
    let inString = false
    let stringChar = ''
    let escape = false
    let inBlockComment = false
    let inLineComment = false

    for (let i = 0; i < code.length; i++) {
        const char = code[i]
        const next = code[i + 1]

        if (inBlockComment) {
            if (char === '*' && next === '/') {
                inBlockComment = false
                i++
            }
            continue
        }

        if (inLineComment) {
            if (char === '\n') {
                inLineComment = false
                result += char
            }
            continue
        }

        if (escape) {
            result += char
            escape = false
            continue
        }

        if (inString) {
            if (char === '\\') {
                escape = true
            } else if (char === stringChar) {
                inString = false
            }
            result += char
            continue
        }

        if (char === '"' || char === '\'' || char === '`') {
            inString = true
            stringChar = char
            result += char
            continue
        }

        if (char === '/' && next === '*') {
            inBlockComment = true
            i++
            continue
        }

        if (char === '/' && next === '/') {
            inLineComment = true
            i++
            continue
        }

        result += char
    }

    return result
}

function extractComponentName(code) {
    const match = code.match(/export\s+(const|default)\s+([A-Z][A-Za-z0-9_]*)/)
    return match ? match[2] : null
}

function parseCssObject(cssText) {
    const root = postcss().process(cssText, { parser: safeParser }).root
    const styleObject = {}
    root.nodes.forEach(decl => {
        if (decl.type === 'decl') {
            const key = decl.prop.replace(/-([a-z])/g, (_, char) => char.toUpperCase())
            styleObject[key] = decl.value
        }
    })

    return styleObject
}

function extractStylesObject(code) {
    const start = code.indexOf('const styles = {')
    if (start === -1) return null

    let i = start + 'const styles = '.length
    while (code[i] !== '{' && i < code.length) i++
    if (code[i] !== '{') return null

    let depth = 0
    let inString = false
    let escape = false
    let end = i

    for (; i < code.length; i++) {
        const char = code[i]

        if (escape) {
            escape = false
            continue
        }

        if (char === '\\') {
            escape = true
            continue
        }

        if (char === '"' || char === '\'' || char === '`') {
            if (inString === char) {
                inString = false
            } else if (!inString) {
                inString = char
            }
            continue
        }

        if (!inString) {
            if (char === '{') depth++
            if (char === '}') depth--
            if (depth === 0) {
                end = i + 1
                break
            }
        }
    }

    return code.slice(start, end)
}

function transformStyles(code, stylesObj) {
    const ast = parser.parse(code, {
        plugins: ['jsx', 'typescript'],
        sourceType: 'module'
    });

    const t = babel.types;

    traverse(ast, {
        VariableDeclarator(path) {
            if (
                path.node.id.name === 'styles' &&
                path.node.init &&
                t.isObjectExpression(path.node.init)
            ) {
                path.remove(); // remove const styles = { ... }
            }
        },
        JSXOpeningElement(path) {
            const attributes = path.get('attributes');

            let classNameAttrPath = null;
            let styleAttrPath = null;
            let classNameKey = null;

            attributes.forEach((attrPath) => {
                const attr = attrPath.node;
                if (
                    attr.type === 'JSXAttribute' &&
                    attr.name.name === 'className' &&
                    attr.value &&
                    attr.value.expression &&
                    attr.value.expression.type === 'MemberExpression' &&
                    attr.value.expression.object.name === 'styles' &&
                    attr.value.expression.property.type === 'Identifier'
                ) {
                    classNameAttrPath = attrPath;
                    classNameKey = attr.value.expression.property.name;
                } else if (
                    attr.type === 'JSXAttribute' &&
                    attr.name.name === 'style'
                ) {
                    styleAttrPath = attrPath;
                }
            });

            if (!classNameAttrPath || !(classNameKey in stylesObj)) return;

            const parsedStyleObj = parseCssObject(stylesObj[classNameKey]);

            const styleObjectExpression = t.objectExpression(
                Object.entries(parsedStyleObj).map(([key, value]) => {
                    const keyNode = /^[a-zA-Z$_][a-zA-Z0-9$_]*$/.test(key)
                        ? t.identifier(key)
                        : t.stringLiteral(key);
                    return t.objectProperty(keyNode, t.stringLiteral(value));
                })
            );

            let mergedStyleExpression = styleObjectExpression;

            if (styleAttrPath) {
                const expr = styleAttrPath.node.value?.expression;
                if (expr && expr.type === 'ObjectExpression') {
                    mergedStyleExpression = t.callExpression(
                        t.memberExpression(t.identifier('Object'), t.identifier('assign')),
                        [styleObjectExpression, expr]
                    );
                }
                styleAttrPath.replaceWith(
                    t.jsxAttribute(t.jsxIdentifier('style'), t.jsxExpressionContainer(mergedStyleExpression))
                );
            } else {
                path.pushContainer(
                    'attributes',
                    t.jsxAttribute(t.jsxIdentifier('style'), t.jsxExpressionContainer(mergedStyleExpression))
                );
            }

            classNameAttrPath.remove();
        }
    });

    const output = generate(ast, {}, code);
    return output.code;
}

function viteNiceCssPlugin() {
    let isBuild = false
    let outDir

    return {
        configResolved(config) {
            isBuild = config.command === 'build'
            outDir = config.build.outDir
        },
        enforce: 'pre',
        generateBundle: async function () {
            const css = collectedStyles.join('\n')

            const result = await postcss([cssnano]).process(css, { from: undefined })

            const outPath = path.resolve(outDir || 'dist', 'bundle.css');
            fs.mkdirSync(path.dirname(outPath), { recursive: true })
            fs.writeFileSync(outPath, result.css)

            collectedStyles = []
        },
        name: pkg.name,

        transform(code, id) {
            if (!id.match(/\.(js|jsx|ts|tsx)$/)) return
            code = stripComments(code)

            const componentName = extractComponentName(code)
            if (!componentName) return

            const stylesRaw = extractStylesObject(code)
            if (!stylesRaw) return
            const stylesBlock = stylesRaw.slice(stylesRaw.indexOf('{') + 1, -1)

            const regex = /(\w+)\s*:\s*`([\s\S]*?)`/g
            const stylesObj = {}
            let match

            while ((match = regex.exec(stylesBlock)) !== null) {
                stylesObj[match[1]] = match[2]
            }

            let output = code

            if (isBuild) {
                const classMap = {}
                for (const key in stylesObj) {
                    const className = `${componentName}-${key}`
                    classMap[key] = className
                    collectedStyles.push(`.${className} { ${stylesObj[key].trim()} }`)
                }

                for (const key in classMap) {
                    const reg = new RegExp(`styles\\.${key}`, 'g')
                    output = output.replace(reg, `"${classMap[key]}"`)
                }

                output = output.replace(/const\s+styles\s*=\s*{([\s\S]*?)};/, '')
                return { code: output, map: null }
            } else {
                output = transformStyles(output, stylesObj)

                output = output.replace(/const\s+styles\s*=\s*{([\s\S]*?)};/, '')
                return { code: output, map: null }
            }
        }
    }
}

module.exports = viteNiceCssPlugin