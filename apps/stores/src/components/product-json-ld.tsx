import type { Product } from "@slice/demo-catalogs";

// Schema.org Product markup, the way Shopify and WooCommerce themes emit it.
// slice.js reads it to know which product the shopper is looking at.
export function ProductJsonLd({
  product,
  storeName,
  url,
  breadcrumbs,
}: {
  product: Product;
  storeName: string;
  url: string;
  breadcrumbs: { name: string; url: string }[];
}) {
  const data = [
    {
      "@context": "https://schema.org",
      "@type": "Product",
      productID: product.id,
      sku: product.id,
      name: product.name,
      description: product.description,
      image: product.images,
      url,
      brand: { "@type": "Brand", name: product.brand ?? storeName },
      category: `${product.category} > ${product.subcategory}`,
      offers: {
        "@type": "Offer",
        priceCurrency: "USD",
        price: product.price,
        availability: product.variants.some((v) => v.inStock)
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
        url,
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: breadcrumbs.map((b, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: b.name,
        item: b.url,
      })),
    },
  ];
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
