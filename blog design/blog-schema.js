// Auto-generates FAQPage JSON-LD schema from any .blog-faq block on the page.
// Add/remove .blog-faq-item entries and the schema stays in sync automatically.
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
      var question = item.querySelector('h3');
      var answer = item.querySelector('p');
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
