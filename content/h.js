// Constructores de bloques de contenido para las lecciones.
exports.p = (text) => ({ t: 'p', text });
exports.h = (text) => ({ t: 'h', text });
exports.ul = (items) => ({ t: 'ul', items });
exports.ol = (items) => ({ t: 'ol', items });
exports.quote = (text) => ({ t: 'quote', text });
exports.callout = (title, items) => ({ t: 'callout', title, items: Array.isArray(items) ? items : [items] });
exports.table = (head, rows) => ({ t: 'table', head, rows });
