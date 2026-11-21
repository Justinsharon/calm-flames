/**
 * Which file in src/assets/images is each product's photo (first entry = main image, rest = gallery).
 * Migration input only: the storefront reads `imageUrl` / `galleryImageUrls` from Firestore.
 */
export const PRODUCT_IMAGE_FILES: Record<string, string[]> = {
  'jumbo-tealight-mogra': ['jumbo_tealights_1791107239446.jpg', 'golden_mogra_jar_1791107483643.jpg'],
  'jumbo-tealight-lotus-pond': ['jumbo_tealights_1791107239446.jpg', 'lotus_bloom_bowl_1791107291224.jpg'],
  'golden-mogra-jar': ['golden_mogra_jar_1791107483643.jpg', 'jumbo_tealights_1791107239446.jpg'],
  'peony-bloom': ['peony_bloom_candle_1791107531344.jpg', 'lotus_bloom_bowl_1791107291224.jpg'],
  'lotus-bloom': ['lotus_bloom_bowl_1791107291224.jpg', 'lotus_urli_1791107260236.jpg'],
  'mandala-tin': ['mandala_tin_1791107355136.jpg', 'royal_urli_1791107306618.jpg'],
  'laddoo-shot': ['laddoo_shot_1791107369511.jpg', 'laddoo_candles_1791107337185.jpg'],
  'rasmalai': ['rasmalai_candle_1791107387057.jpg', 'mithai_bowl_1791107516766.jpg'],
  'floating-daisy': ['floating_daisy_1791107499165.jpg', 'lotus_urli_1791107260236.jpg'],
  'ganpati-wax-sachet': ['ganpati_sachet_1791107415334.jpg', 'wax_sachets_1791107430468.jpg'],
  'golden-foil-wax-sachet': ['wax_sachets_1791107430468.jpg', 'golden_foil_urli_1791107277725.jpg'],
  'sunflower-wax-sachet': ['wax_sachets_1791107430468.jpg', 'ganpati_sachet_1791107415334.jpg'],
  'rose-wax-sachet': ['wax_sachets_1791107430468.jpg', 'peony_bloom_candle_1791107531344.jpg'],
  'tulip-wax-sachet': ['wax_sachets_1791107430468.jpg', 'peony_bloom_candle_1791107531344.jpg'],
  'orange-cinnamon-wax-sachet': ['wax_sachets_1791107430468.jpg', 'royal_urli_1791107306618.jpg'],
  'daisy-wax-sachet': ['wax_sachets_1791107430468.jpg', 'floating_daisy_1791107499165.jpg'],
  'floral-lotus-urli': ['lotus_urli_1791107260236.jpg', 'lotus_bloom_bowl_1791107291224.jpg'],
  'golden-foil-lotus-urli': ['golden_foil_urli_1791107277725.jpg', 'royal_urli_1791107306618.jpg'],
  'lotus-pond-urli': ['lotus_urli_1791107260236.jpg', 'jumbo_tealights_1791107239446.jpg'],
  'mogra-lotus-urli': ['lotus_urli_1791107260236.jpg', 'golden_mogra_jar_1791107483643.jpg'],
  'lotus-bloom-bowl': ['lotus_bloom_bowl_1791107291224.jpg', 'lotus_urli_1791107260236.jpg'],
  'lotus-bloom-bowl-red': ['lotus_bloom_bowl_1791107291224.jpg', 'lotus_urli_1791107260236.jpg'],
  'royal-urli': ['royal_urli_1791107306618.jpg', 'golden_foil_urli_1791107277725.jpg'],
  'mithai-bowl': ['mithai_bowl_1791107516766.jpg', 'laddoo_candles_1791107337185.jpg'],
  'modak': ['modak_candles_1791107322524.jpg', 'ganpati_hamper_1791107402793.jpg'],
  'laddoo': ['laddoo_candles_1791107337185.jpg', 'mithai_bowl_1791107516766.jpg'],
  'pack-of-1-laddoo': ['laddoo_candles_1791107337185.jpg', 'corporate_hamper_1791107468493.jpg'],
  'pack-of-2-laddoo': ['laddoo_candles_1791107337185.jpg', 'corporate_hamper_1791107468493.jpg'],
  'pack-of-4-laddoo': ['laddoo_candles_1791107337185.jpg', 'corporate_hamper_1791107468493.jpg'],
  'pack-of-4-modak-brown': ['modak_candles_1791107322524.jpg', 'ganpati_hamper_1791107402793.jpg'],
  'pack-of-4-laddoo-brown': ['laddoo_candles_1791107337185.jpg', 'corporate_hamper_1791107468493.jpg'],
  'pack-of-4-laddoo-premium': ['laddoo_candles_1791107337185.jpg', 'corporate_hamper_1791107468493.jpg'],
  'ganpati-bappa-hamper': [
    'ganpati_hamper_1791107402793.jpg',
    'modak_candles_1791107322524.jpg',
    'corporate_hamper_1791107468493.jpg'
  ],
  // Historical (inactive) products, kept for order-history references
  'jasmine-sage': ['product_jasmine_sage_1791022851970.jpg'],
  'sandalwood-rose': ['product_sandalwood_rose_1791022868390.jpg'],
  'nag-champa': ['product_nag_champa_1791022883447.jpg'],
  'ritual-collection': ['collection_ritual_1791022895596.jpg']
};
