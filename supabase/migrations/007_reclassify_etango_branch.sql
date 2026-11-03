DELETE FROM retail_branches
WHERE store = 'Usave'
  AND name = 'Usave Oshakati Etango';

INSERT INTO retail_branches (store, name, is_liquor)
SELECT 'Shoprite', 'Shoprite Express Etango', false
WHERE NOT EXISTS (
  SELECT 1
  FROM retail_branches
  WHERE store = 'Shoprite'
    AND name = 'Shoprite Express Etango'
);
