# Typelens

A VSCode plugin which adds reference counter code lenses to **typescript, javascript, scss and less** files.

Do You need support for some other language? No problem, contact the author of the extension You are using for that language and ask
politely for Symbol and Reference providers. This extension picks up references and symbols provided by those extensions, so if it is not working
properly I can't do anything about it (probably).

## It looks like this:
![Example code with references code lens](https://raw.githubusercontent.com/kisstkondoros/typelens/master/screenshot.png)

## Configuration properties

- typelens.blackboxTitle
  - Localization for the case where the only usages are from blackboxed sources
- typelens.blackbox
  - Array of glob patterns for blackboxed resources
- typelens.exludeself
  - A flag which indicates whether the initiating reference should be excluded
- typelens.decorateunused
  - A flag which indicates whether the initiating reference should be decorated if it is unsed
- typelens.skiplanguages
  - Languages where the references should not be shown
- typelens.singular
  - Localization for the singular case
- typelens.plural
  - Localization for the plural case
- typelens.noreferences
  - Localization for the case when there are no references found
- typelens.unusedcolor
  - Color for unused references
