const postcss = require('postcss');
const safeParser = require('postcss-safe-parser');

module.exports = {
    meta: {
        fixable: 'whitespace',
        type: 'problem',
        docs: {
            description: 'Validate and auto-indent CSS in template literals inside styles objects',
            category: 'Stylistic Issues',
            recommended: false
        }
    },
    create(context) {
        return {
            VariableDeclarator(node) {
                if (
                    node.id.name !== 'styles' ||
                    node.init.type !== 'ObjectExpression'
                ) {
                    return;
                }

                node.init.properties.forEach((prop) => {
                    if (
                        prop.value &&
                        prop.value.type === 'TemplateLiteral' &&
                        prop.value.quasis.length === 1
                    ) {
                        const rawCss = prop.value.quasis[0].value.raw;

                        try {
                            postcss().process(rawCss, { parser: safeParser }).sync();
                        } catch (err) {
                            context.report({
                                node: prop.value,
                                message: `CSS syntax error: ${err.reason || err.message}`,
                            });
                            return;
                        }

                        const lines = rawCss.split('\n');
                        const contentLines = lines.slice(1, lines.length - 1);

                        const expectedIndent = '  ';
                        let needsFix = false;

                        contentLines.forEach((line) => {
                            if (line.length > 0 && !line.startsWith(expectedIndent)) {
                                needsFix = true;
                            }
                        });

                        if (needsFix) {
                            const fixedCss = [
                                lines[0],
                                ...contentLines.map((line) =>
                                    line.length > 0 ? expectedIndent + line.trimStart() : line
                                ),
                                lines[lines.length - 1],
                            ].join('\n');

                            context.report({
                                node: prop.value.quasis[0],
                                message: 'CSS inside template literal should be indented by 2 spaces',
                                fix(fixer) {
                                    return fixer.replaceText(
                                        prop.value.quasis[0],
                                        '`' + fixedCss + '`'
                                    );
                                },
                            });
                        }
                    }
                });
            },
        };
    },
};
