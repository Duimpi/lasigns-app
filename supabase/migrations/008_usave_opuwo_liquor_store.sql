INSERT INTO retail_branches (store, name, is_liquor)
SELECT 'Usave', 'USave Opuwo Liquor Store', true
WHERE NOT EXISTS (
  SELECT 1
  FROM retail_branches
  WHERE store = 'Usave'
    AND name = 'USave Opuwo Liquor Store'
);
