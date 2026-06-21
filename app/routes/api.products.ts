import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

/** Lightweight product list for the task-panel product picker. */
export async function loader({ request }: LoaderFunctionArgs) {
  const { admin } = await authenticate.admin(request);
  try {
    const r = await admin.graphql(
      `{ products(first: 100, sortKey: UPDATED_AT, reverse: true) {
        nodes { id title handle featuredImage { url } priceRangeV2 { minVariantPrice { amount currencyCode } } }
      } }`,
    );
    const { data } = (await r.json()) as {
      data?: {
        products?: {
          nodes?: { id: string; title: string; handle: string; featuredImage?: { url?: string }; priceRangeV2?: { minVariantPrice?: { amount?: string; currencyCode?: string } } }[];
        };
      };
    };
    const products = (data?.products?.nodes ?? []).map((n) => ({
      id: n.id,
      title: n.title,
      handle: n.handle,
      image: n.featuredImage?.url ?? "",
      price: n.priceRangeV2?.minVariantPrice ? `${Math.round(Number(n.priceRangeV2.minVariantPrice.amount))} ${n.priceRangeV2.minVariantPrice.currencyCode ?? ""}`.trim() : "",
    }));
    return { products };
  } catch {
    return { products: [] };
  }
}
