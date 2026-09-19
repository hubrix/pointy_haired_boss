import markdown from '@textlint/textlint-plugin-markdown';

const processor = new markdown.default.Processor().processor('.md');
export const parseMarkdown = (source) => processor.preProcess(source, 'fixture.md');
