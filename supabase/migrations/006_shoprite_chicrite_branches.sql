INSERT INTO retail_branches (store, name, is_liquor)
SELECT branch.store, branch.name, branch.is_liquor
FROM (
  VALUES
    ('Shoprite', 'Shoprite', false),
    ('Shoprite', 'Shoprite ChicRite', false),
    ('Shoprite', 'Shoprite Grootfontein ChicRite', false),
    ('Shoprite', 'Shoprite Goreangab ChicRite', false),
    ('Shoprite', 'Shoprite Independence ChicRite', false),
    ('Shoprite', 'Shoprite Lafrenz ChicRite', false),
    ('Shoprite', 'Shoprite Katima Mulilo ChicRite', false),
    ('Shoprite', 'Shoprite Rundu ChicRite', false),
    ('Checkers', 'Checkers', false),
    ('Usave', 'Usave', false)
) AS branch(store, name, is_liquor)
WHERE NOT EXISTS (
  SELECT 1
  FROM retail_branches existing
  WHERE existing.store = branch.store
    AND existing.name = branch.name
);
