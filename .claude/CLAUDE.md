# 网页编程规范

## 通用原则

- 代码简洁优先，避免不必要的抽象和过度设计
- 不添加未被要求的功能、注释或错误处理
- 优先编辑现有文件，而非创建新文件
- 删除无用代码，不保留注释掉的代码块

## HTML

- 使用语义化标签（`<header>`, `<nav>`, `<main>`, `<section>`, `<article>`, `<footer>`）
- 所有图片必须有 `alt` 属性
- 表单输入必须有对应的 `<label>`
- `<!DOCTYPE html>` 声明放在文件首行
- 字符编码声明：`<meta charset="UTF-8">`
- 属性值使用双引号
- 自闭合标签不加斜杠（`<br>` 而非 `<br/>`）

## CSS

- 类名使用 kebab-case（如 `.user-profile`）
- 避免使用 `!important`，除非覆盖第三方样式
- 优先使用 Flexbox / Grid 布局，避免浮动布局
- 媒体查询采用移动优先（mobile-first）策略
- CSS 变量用于主题色和间距：
  ```css
  :root {
    --color-primary: #3b82f6;
    --spacing-md: 1rem;
  }
  ```
- 选择器嵌套不超过 3 层

## JavaScript / TypeScript

- 使用 `const` 优先，必要时用 `let`，禁止 `var`
- 使用箭头函数，避免 `function` 关键字（除类方法外）
- 异步操作统一使用 `async/await`，不使用回调嵌套
- 模块化：每个文件只做一件事，通过 ES Modules 导入导出
- 变量和函数名使用 camelCase，常量使用 UPPER_SNAKE_CASE
- 类名使用 PascalCase
- 使用可选链 `?.` 和空值合并 `??` 处理可能为空的值
- 禁止直接修改 DOM 字符串拼接，防止 XSS（使用 `textContent` 而非 `innerHTML`）

## TypeScript 专项

- 禁止使用 `any`，用 `unknown` 替代不确定类型
- 接口名不加 `I` 前缀
- 优先使用 `interface` 定义对象类型，`type` 用于联合类型和工具类型
- 启用严格模式：`"strict": true`

## 安全

- 不在前端存储敏感信息（密码、token 不存于 `localStorage`，token 优先存于内存或 httpOnly Cookie）
- 所有用户输入在展示前需转义
- 使用 CSP（Content Security Policy）头
- HTTPS 通信，Cookie 设置 `Secure` 和 `SameSite`
- 避免使用 `eval()` 和 `new Function()`

## 性能

- 图片使用现代格式（WebP / AVIF），提供 `srcset` 适配不同分辨率
- 懒加载非首屏图片：`loading="lazy"`
- 关键 CSS 内联，非关键资源异步加载
- 避免强制同步布局（不在循环中读写 DOM）
- 第三方脚本使用 `defer` 或 `async`

## 可访问性（a11y）

- 交互元素必须可键盘访问
- 颜色对比度满足 WCAG AA 标准（正文 4.5:1，大文字 3:1）
- 动态内容变化使用 ARIA live regions
- 模态框需管理焦点陷阱
- 不依赖颜色作为唯一信息传达方式

## 文件结构

```
src/
  assets/        # 静态资源（图片、字体）
  components/    # 可复用组件
  pages/         # 页面级组件
  styles/        # 全局样式
  utils/         # 工具函数
  types/         # TypeScript 类型定义（如有）
```

## 代码格式

- 缩进：2 个空格
- 每行不超过 100 个字符
- 字符串使用单引号（JS/TS），模板字面量用于字符串拼接
- 语句末尾加分号
- 对象和数组末尾加尾逗号（trailing comma）
- 文件末尾保留一个空行

## Git 提交

- 提交信息格式：`<type>: <简短描述>`
- type 类型：`feat` / `fix` / `style` / `refactor` / `perf` / `docs` / `test` / `chore`
- 每次提交只做一件事，保持原子性
