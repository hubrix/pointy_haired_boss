import { unified } from 'unified';
import parse from 'remark-parse';
import gfm from 'remark-gfm';
import frontmatter from 'remark-frontmatter';
import math from 'remark-math';

const parser = unified().use(parse).use(gfm).use(frontmatter, ['yaml', 'toml']).use(math);
export const parseMarkdown = (source) => parser.parse(source);
