// Auto-generates FAQPage JSON-LD schema from any .blog-faq block on the page,
// and fills any .blog-toc block with links to every .blog-h2 heading.
// Add/remove .blog-faq-item entries or headings and both stay in sync.
//
// Shopify integration:
// 1. Copy this file into the theme's /assets folder.
// 2. In layout/theme.liquid, load it only on article (blog post) pages:
//      {%- if template contains 'article' -%}
//        <script src="{{ 'blog-schema.js' | asset_url }}" defer="defer"></script>
//      {%- endif -%}
// 3. No other setup needed - this script reads whatever .blog-faq markup
//    the blog post's rich text content renders with, whether that HTML
//    came from this static file or Shopify's blog post editor.
(function generateFaqSchema() {
  document.querySelectorAll('.blog-faq').forEach(function (faqBlock) {
    var items = faqBlock.querySelectorAll('.blog-faq-item');
    if (!items.length) return;

    var mainEntity = Array.prototype.map.call(items, function (item) {
      // Accordion markup uses <summary>; older posts used an <h3>.
      var question = item.querySelector('summary') || item.querySelector('h3');
      var answer = item.querySelector('summary')
        ? item.querySelector('summary ~ *')
        : item.querySelector('p');
      return {
        "@type": "Question",
        "name": question ? question.textContent.trim() : "",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": answer ? answer.innerHTML.trim() : ""
        }
      };
    });

    var schema = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": mainEntity
    };

    var script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(schema);
    faqBlock.insertAdjacentElement('afterend', script);
  });
})();

// Fills every .blog-toc with a numbered list of links to each .blog-h2 in the
// post. Only .blog-h2 headings are listed, so <h2>s belonging to other
// components (key takeaway, product callout) are never picked up. Headings
// without an id get one generated from their text so the anchors work.
(function generateTableOfContents() {
  document.querySelectorAll('.blog-toc').forEach(function (toc) {
    var scope = toc.closest('.spacetalk-blog') || document;
    var headings = Array.prototype.slice.call(scope.querySelectorAll('.blog-h2'))
      .filter(function (heading) {
        return !toc.contains(heading);
      });

    if (!headings.length) {
      toc.style.display = 'none';
      return;
    }

    var list = document.createElement('ol');

    headings.forEach(function (heading, index) {
      if (!heading.id) {
        heading.id = (heading.textContent.trim().toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '') || 'section') + '-' + (index + 1);
      }

      var link = document.createElement('a');
      link.href = '#' + heading.id;
      link.textContent = heading.textContent.trim();

      var item = document.createElement('li');
      item.appendChild(link);
      list.appendChild(item);
    });

    if (!toc.querySelector('h2')) {
      var title = document.createElement('h2');
      title.textContent = 'In this article';
      toc.appendChild(title);
    }
    toc.appendChild(list);
  });
})();
