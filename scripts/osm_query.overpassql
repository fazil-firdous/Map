[out:json][timeout:180];
(
  nwr["shop"](33.99,74.72,34.20,74.90);
  nwr["amenity"~"^(restaurant|cafe|fast_food|bank|atm|pharmacy|clinic|doctors|dentist|hospital|fuel|bar|pub|ice_cream|marketplace|bureau_de_change|car_rental|car_wash|veterinary|internet_cafe|food_court)$"](33.99,74.72,34.20,74.90);
  nwr["craft"](33.99,74.72,34.20,74.90);
  nwr["tourism"~"^(hotel|guest_house|hostel|motel|apartment)$"](33.99,74.72,34.20,74.90);
  nwr["office"](33.99,74.72,34.20,74.90);
  nwr["healthcare"](33.99,74.72,34.20,74.90);
);
out center tags;
