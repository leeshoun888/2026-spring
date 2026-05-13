export function generateSearchKeywords(productName: string) {
  const product = normalizeProductName(productName) || "매일유업";
  const compact = product.replace(/\s+/g, "");
  const brand = inferBrand(product);
  const category = inferCategory(product);

  return unique([
    product,
    `${product} 후기`,
    `${product} 리뷰`,
    `${product} 단점`,
    `${product} 가격`,
    `${product} 맛`,
    `${product} 품질`,
    `${product} 구매`,
    `${product} 추천`,
    `${compact} 후기`,
    `${brand} ${category} 후기`,
    `${brand} ${category} 단점`,
    `${category} 비교`,
    `${category} 추천`,
    `${category} 유튜브 리뷰`,
    `${brand} 제품 불만`
  ]).slice(0, 16);
}

function normalizeProductName(productName: string) {
  return productName.replace(/\s+/g, " ").trim();
}

function inferBrand(productName: string) {
  if (productName.includes("상하")) return "상하목장";
  if (productName.includes("셀렉스")) return "셀렉스";
  if (productName.includes("바리스타")) return "바리스타룰스";
  if (productName.includes("매일")) return "매일유업";
  return "매일유업";
}

function inferCategory(productName: string) {
  if (/그릭|요거트|요구르트|발효유/.test(productName)) return "그릭요거트";
  if (/우유|두유|아몬드|오트/.test(productName)) return "우유";
  if (/커피|라떼|바리스타/.test(productName)) return "커피";
  if (/단백질|프로틴|셀렉스/.test(productName)) return "단백질";
  if (/분유|이유식|앱솔루트/.test(productName)) return "분유";
  return "매일유업";
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
