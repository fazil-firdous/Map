-- 1.3: free delivery is now each restaurant's own choice ("free delivery when the food is ₹X or more", paid by the
-- restaurant). Kezia no longer pays for new-customer free delivery: switch that offer off.
UPDATE settings SET value = '0' WHERE key = 'promo_new_orders';
