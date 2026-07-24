# MAD Schema Snapshot

- Database: `Oracle-10(mad)`
- Tables: `15`
- Relationships: `21`

## Tables

| Table | Type | Columns |
| --- | --- | ---: |
| GISDATA.L3_TAXPAR_POLY_ASSESS | Feature Class | 49 |
| MAD.MAD_ADDPT_STRUCT_LUT | Table | 5 |
| MAD.MAD_ADDRESS_POINTM | Feature Class | 22 |
| MAD.MAD_ADDRESS_POINTM_CENTROID | Feature Class | 8 |
| MAD.MAD_ADDRESS_VARIANTS | Table | 65 |
| MAD.MAD_BASE_RANGE_VARIANTS | Table | 25 |
| MAD.MAD_BASE_STREET_ARC | Feature Class | 34 |
| MAD.MAD_MASTER_ADDRESS | Table | 45 |
| MAD.MAD_MASTER_STREET_NAME | Table | 14 |
| MAD.MAD_MSAG_COMMUNITY_POLYM | Feature Class | 8 |
| MAD.MAD_SITE_NAMES | Table | 8 |
| MAD.MAD_SITE_POLYM | Feature Class | 8 |
| MAD.MAD_SOURCE | Table | 6 |
| MAD.MAD_STREET_NAME_VARIANTS | Table | 21 |
| MAD.MAD_STRUCTURES_POLY | Feature Class | 16 |

## Columns by Table

### GISDATA.L3_TAXPAR_POLY_ASSESS

| Column | Type | Nullable | Notes |
| --- | --- | --- | --- |
| OBJECTID_1 | OID | unknown | required |
| OBJECTID | Integer | unknown | PK |
| MAP_PAR_ID | String | yes |  |
| LOC_ID | String | yes |  |
| POLY_TYPE | String | yes |  |
| MAP_NO | String | yes |  |
| SOURCE | String | unknown |  |
| PLAN_ID | String | yes |  |
| LAST_EDIT | Integer | yes |  |
| BND_CHK | String | yes |  |
| NO_MATCH | String | unknown |  |
| TOWN_ID | Integer | yes |  |
| PROP_ID | String | yes |  |
| BLDG_VAL | Integer | yes |  |
| LAND_VAL | Integer | yes |  |
| OTHER_VAL | Integer | yes |  |
| TOTAL_VAL | Integer | yes |  |
| FY | Integer | yes |  |
| LOT_SIZE | Double | yes |  |
| LS_DATE | String | yes |  |
| LS_PRICE | Integer | yes |  |
| USE_CODE | String | yes |  |
| SITE_ADDR | String | yes |  |
| ADDR_NUM | String | yes |  |
| FULL_STR | String | yes |  |
| LOCATION | String | yes |  |
| CITY | String | yes |  |
| ZIP | String | yes |  |
| OWNER1 | String | yes |  |
| OWN_ADDR | String | yes |  |
| OWN_CITY | String | yes |  |
| OWN_STATE | String | yes |  |
| OWN_ZIP | String | yes |  |
| OWN_CO | String | yes |  |
| LS_BOOK | String | yes |  |
| LS_PAGE | String | yes |  |
| REG_ID | String | yes |  |
| ZONING | String | yes |  |
| YEAR_BUILT | Integer | yes |  |
| BLD_AREA | Integer | yes |  |
| UNITS | Integer | yes |  |
| RES_AREA | Integer | yes |  |
| STYLE | String | yes |  |
| NUM_ROOMS | Integer | yes |  |
| LOT_UNITS | String | yes |  |
| STORIES | String | yes |  |
| SHAPE | Geometry | yes | required, spatial |
| SHAPE.AREA | Double | yes | required, spatial |
| SHAPE.LEN | Double | yes | required, spatial |

### MAD.MAD_ADDPT_STRUCT_LUT

| Column | Type | Nullable | Notes |
| --- | --- | --- | --- |
| OBJECTID | OID | unknown | PK, required |
| ADDRESS_POINT_ID | String | yes |  |
| LOC_ID | String | yes |  |
| STRUCTURE_ID | String | yes |  |
| STRUCTURE_TOWN_ID | SmallInteger | yes |  |

### MAD.MAD_ADDRESS_POINTM

| Column | Type | Nullable | Notes |
| --- | --- | --- | --- |
| OBJECTID | OID | unknown | PK, required |
| ADDRESS_POINT_ID | String | yes |  |
| SOURCE_NAME_ID | Integer | yes |  |
| ID_IN_LOCAL_SOURCE | String | yes |  |
| LOC_ID | String | yes |  |
| GEOGRAPHIC_TOWN_ID | SmallInteger | yes |  |
| COMMUNITY_ID | Integer | yes |  |
| POINT_TYPE | String | yes |  |
| STRUCTURE_STATUS | String | yes |  |
| BUILDING_COUNT | Integer | yes |  |
| GEOGRAPHIC_EDIT_STATUS | String | yes |  |
| ADDRESS_STATUS | String | yes |  |
| ATTRIBUTE_EDIT_STATUS | String | yes |  |
| LAST_EDIT_DATE | Integer | yes |  |
| LAST_EDIT_BY | String | yes |  |
| LAST_EDIT_COMMENTS | String | yes |  |
| STATUS_COLOR | String | yes |  |
| TYPE_ICON | String | yes |  |
| LABEL_TEXT | String | yes |  |
| PARENT_ID | String | yes |  |
| SITE_ID | Integer | yes |  |
| SHAPE | Geometry | yes | required, spatial |

### MAD.MAD_ADDRESS_POINTM_CENTROID

| Column | Type | Nullable | Notes |
| --- | --- | --- | --- |
| OBJECTID | OID | unknown | PK, required |
| LOC_ID | String | yes |  |
| CENTROID_ID | String | yes |  |
| BUILDING_COUNT | SmallInteger | yes |  |
| BUILDING_SQUARE_FEET | Double | yes |  |
| PERCENT_PARCEL_COVER | Double | yes |  |
| GEOGRAPHIC_TOWN_ID | SmallInteger | yes |  |
| SHAPE | Geometry | yes | required, spatial |

### MAD.MAD_ADDRESS_VARIANTS

| Column | Type | Nullable | Notes |
| --- | --- | --- | --- |
| OBJECTID | OID | unknown | PK, required |
| SOURCE_NAME_ID | Integer | yes |  |
| ID_IN_ORIGINAL_SOURCE | String | yes |  |
| MISC_SOURCE_ID | Integer | yes |  |
| ID_IN_MSC_SOURCE | String | yes |  |
| ADDRESS_POINT_ID | String | yes |  |
| LOC_ID | String | yes |  |
| COMMUNITY_ID | Integer | yes |  |
| ADDRESS_TOWN_ID | SmallInteger | yes |  |
| GEOGRAPHIC_TOWN_ID | SmallInteger | yes |  |
| INPUT_FULL_ADDRESS | String | yes |  |
| INPUT_FULL_NUMBER | String | yes |  |
| INPUT_FULL_STREET_NAME | String | yes |  |
| INPUT_FULL_LOCATION | String | yes |  |
| INPUT_CITY | String | yes |  |
| INPUT_ADDRESS_TOWN_ID | SmallInteger | yes |  |
| INPUT_COMMUNITY_ID | Integer | yes |  |
| INPUT_STATE | String | yes |  |
| INPUT_FULL_ZIP | String | yes |  |
| INPUT_SITE | String | yes |  |
| MASTER_ADDRESS_ID | Integer | yes |  |
| FULL_NUMBER_STANDARDIZED | String | yes |  |
| ADDRESS_NUMBER_PREFIX | String | yes |  |
| ADDRESS_NUMBER | Integer | yes |  |
| ADDRESS_NUMBER_SUFFIX | String | yes |  |
| ADDRESS_NUMBER_2_PREFIX | String | yes |  |
| ADDRESS_NUMBER_2 | Integer | yes |  |
| ADDRESS_NUMBER_2_SUFFIX | String | yes |  |
| STREET_NAME_ID | Integer | yes |  |
| STREET_NAME_ID_2 | Integer | yes |  |
| STREET_NAME_ID_3 | Integer | yes |  |
| RELATIVE_LOCATION | String | yes |  |
| POSITIONAL | String | yes |  |
| POSITIONAL_2 | String | yes |  |
| POSITIONAL_3 | String | yes |  |
| MISC_LOCATION | String | yes |  |
| SUBADDRESS_STANDARDIZED | String | yes |  |
| NON_BUILDING_STRUCTURE_NAME | String | yes |  |
| BUILDING_NAME | String | yes |  |
| WING | String | yes |  |
| FLOOR | String | yes |  |
| UNIT | String | yes |  |
| UNIT_TYPE | String | yes |  |
| ROOM | String | yes |  |
| ZIPCODE | String | yes |  |
| PLUS_4 | String | yes |  |
| ZIP4_ZIPCODE | String | yes |  |
| SITE_ID | Integer | yes |  |
| SITE_NAME_ID | Integer | yes |  |
| SUBSITE | String | yes |  |
| FEATURE | String | yes |  |
| OTHER_LOCATION | String | yes |  |
| CUSTOMER_OR_OWNER | String | yes |  |
| USECODE | String | yes |  |
| BUILDING_VALUE | Integer | yes |  |
| YEAR_BUILT | String | yes |  |
| EDIT_STATUS | String | yes |  |
| DATE_CREATED | Integer | yes |  |
| LAST_EDIT_DATE | Integer | yes |  |
| LAST_EDIT_BY | String | yes |  |
| COMMENTS | String | yes |  |
| UNIT_MIN | String | yes |  |
| UNIT_MAX | String | yes |  |
| MAID_FLAG | String | yes |  |
| ADDRESS_VARIANT_ID | Guid | yes |  |

### MAD.MAD_BASE_RANGE_VARIANTS

| Column | Type | Nullable | Notes |
| --- | --- | --- | --- |
| OBJECTID | OID | unknown | PK, required |
| RANGE_SOURCE_NAME_ID | Integer | yes |  |
| STREET_NAME_ID | Integer | yes |  |
| ALIAS_FLAG | String | yes |  |
| STREET_NAME_VARIANT_ID | Integer | yes |  |
| LINK_FEAT_ID | String | yes |  |
| BASE_SEGMENT_ID | Guid | yes |  |
| ADDRESS_RANGE_TYPE | String | yes |  |
| FROM_ADDRESS_LEFT | String | unknown |  |
| TO_ADDRESS_LEFT | String | unknown |  |
| PARITY_LEFT | String | yes |  |
| FROM_ADDRESS_RIGHT | String | unknown |  |
| TO_ADDRESS_RIGHT | String | unknown |  |
| PARITY_RIGHT | String | yes |  |
| COMMUNITY_ID_LEFT | Integer | yes |  |
| COMMUNITY_ID_RIGHT | Integer | yes |  |
| COMMENTS | String | yes |  |
| MSAG_STNAME_VARIANT_ID | Integer | yes |  |
| GLOBALID | GlobalID | unknown | required |
| BASE_RANGE_VARIANT_ID | Guid | yes |  |
| COMMUNITY_DIFFERENCE | String | yes |  |
| ROUTE_TYPE | String | yes |  |
| LAST_EDIT_DATE | Integer | yes |  |
| LAST_EDIT_BY | String | yes |  |
| LAST_EDIT_TYPE | String | yes |  |

### MAD.MAD_BASE_STREET_ARC

| Column | Type | Nullable | Notes |
| --- | --- | --- | --- |
| OBJECTID | OID | unknown | PK, required |
| SOURCE_NAME_ID | Integer | yes |  |
| NAVTEQ_LINK_ID | Double | yes |  |
| NAVTEQ_FEATURE_ID | Double | yes |  |
| LINK_FEAT_ID | String | yes |  |
| BASE_SEGMENT_ID | Guid | yes |  |
| FUNCTIONAL_CLASS | String | yes |  |
| NAVTEQ_LEFT_AREA_ID | Double | yes |  |
| NAVTEQ_RIGHT_AREA_ID | Double | yes |  |
| COMMUNITY_ID_LEFT_ADDRESS | Integer | yes |  |
| COMMUNITY_ID_RIGHT_ADDRESS | Integer | yes |  |
| ZIP_LEFT_ADDRESS | String | yes |  |
| ZIP_RIGHT_ADDRESS | String | yes |  |
| STATE_LEFT_ADDRESS | String | yes |  |
| STATE_RIGHT_ADDRESS | String | yes |  |
| DISJOINT_GEOGRAPHY | String | yes |  |
| DISJOINT_RANGE | String | yes |  |
| PAVED | String | yes |  |
| PRIVATE | String | yes |  |
| RAMP | String | yes |  |
| BRIDGE | String | yes |  |
| TOLLWAY | String | yes |  |
| TUNNEL | String | yes |  |
| FERRY_TYPE | String | yes |  |
| SEGMENT_CREATION_DATE | Integer | yes |  |
| LAST_EDIT_DATE | Integer | yes |  |
| LAST_EDIT_BY | String | yes |  |
| LAST_EDIT_COMMENTS | String | yes |  |
| GUID_TEMP | Guid | yes |  |
| FLIPPED | String | yes |  |
| LAST_EDIT_TYPE | String | yes |  |
| SHAPE | Geometry | yes | required, spatial |
| GLOBALID | GlobalID | unknown | required |
| SHAPE.LEN | Double | yes | required, spatial |

### MAD.MAD_MASTER_ADDRESS

| Column | Type | Nullable | Notes |
| --- | --- | --- | --- |
| OBJECTID | OID | unknown | PK, required |
| MASTER_ADDRESS_ID | Integer | unknown |  |
| ADDRESS_POINT_ID | String | yes |  |
| FULL_NUMBER_STANDARDIZED | String | yes |  |
| STREET_NAME_ID | Integer | yes |  |
| REL_LOC | String | yes |  |
| SUBADDRESS_STANDARDIZED | String | yes |  |
| COMMUNITY_ID | Integer | yes |  |
| ADDRESS_TOWN_ID | SmallInteger | yes |  |
| GEOGRAPHIC_TOWN_ID | SmallInteger | yes |  |
| SITE_NAME_ID | Integer | yes |  |
| SITE_ID | Integer | yes |  |
| SUBSITE | String | yes |  |
| NON_BUILDING_STRUCTURE_NAME | String | yes |  |
| BUILDING_NAME | String | yes |  |
| WING | String | yes |  |
| FLOOR | String | yes |  |
| UNIT | String | yes |  |
| UNIT_TYPE | String | yes |  |
| ROOM | String | yes |  |
| OTHER_LOCATION | String | yes |  |
| ZIPCODE | String | yes |  |
| ADDRESS_STATUS | String | yes |  |
| STATUS_COLOR | String | yes |  |
| PARENT_ADDRESS_ID | Integer | yes |  |
| MULTI_ID | String | yes |  |
| ADDRESS_NUMBER_PREFIX | String | yes |  |
| ADDRESS_NUMBER | Integer | yes |  |
| ADDRESS_NUMBER_SUFFIX | String | yes |  |
| ADDRESS_NUMBER_2_PREFIX | String | yes |  |
| ADDRESS_NUMBER_2 | Integer | yes |  |
| ADDRESS_NUMBER_2_SUFFIX | String | yes |  |
| PARITY | String | yes |  |
| UNIT_MIN | String | yes |  |
| UNIT_MAX | String | yes |  |
| DATE_CREATED | Integer | yes |  |
| LAST_EDIT_DATE | Integer | yes |  |
| LAST_EDIT_BY | String | yes |  |
| LAST_EDIT_COMMENTS | String | yes |  |
| SINGLE_SOURCE | String | yes |  |
| ADDRESS_CLASS | String | yes |  |
| MA_UUID | Guid | yes |  |
| PROC_FLAG | String | yes |  |
| ID_OF_PREVIOUS_ADDRESS | Integer | yes |  |
| ID_OF_REPLACEMENT_ADDRESS | Integer | yes |  |

### MAD.MAD_MASTER_STREET_NAME

| Column | Type | Nullable | Notes |
| --- | --- | --- | --- |
| OBJECTID | OID | unknown | PK, required |
| STREET_NAME_ID | Integer | unknown |  |
| STREET_NAME | String | yes |  |
| COMMUNITY_ID | Integer | yes |  |
| REAL_STREET | String | yes |  |
| PRE_MOD | String | yes |  |
| PRE_DIR | String | yes |  |
| PRE_TYPE | String | yes |  |
| STR_NAME_BASE | String | yes |  |
| POST_TYPE | String | yes |  |
| POST_DIR | String | yes |  |
| POST_MOD | String | yes |  |
| NOTES | String | yes |  |
| NEIGHBORHOOD | String | yes |  |

### MAD.MAD_MSAG_COMMUNITY_POLYM

| Column | Type | Nullable | Notes |
| --- | --- | --- | --- |
| OBJECTID | OID | unknown | PK, required |
| COMMUNITY_ID | Integer | yes |  |
| COMMUNITY_NAME | String | yes |  |
| ADDRESS_TOWN_ID | SmallInteger | yes |  |
| STATE | String | yes |  |
| SHAPE | Geometry | yes | required, spatial |
| SHAPE.AREA | Double | yes | required, spatial |
| SHAPE.LEN | Double | yes | required, spatial |

### MAD.MAD_SITE_NAMES

| Column | Type | Nullable | Notes |
| --- | --- | --- | --- |
| OBJECTID | OID | unknown | PK, required |
| SITE_NAME_ID | Integer | unknown |  |
| SITE_NAME | String | yes |  |
| SITE_ID | Integer | yes |  |
| GEOGRAPHIC_TOWN_ID | SmallInteger | yes |  |
| SITENAME_SOURCETYPE | String | yes |  |
| SITENAME_CLASS | String | yes |  |
| CLN_FLAG | String | yes |  |

### MAD.MAD_SITE_POLYM

| Column | Type | Nullable | Notes |
| --- | --- | --- | --- |
| OBJECTID | OID | unknown | PK, required |
| SITE_ID | Integer | unknown |  |
| PRIORITY | String | yes |  |
| GEOGRAPHIC_TOWN_ID | SmallInteger | yes |  |
| ORIGINAL_SITE_ID | String | yes |  |
| SHAPE | Geometry | yes | required, spatial |
| SHAPE.AREA | Double | yes | required, spatial |
| SHAPE.LEN | Double | yes | required, spatial |

### MAD.MAD_SOURCE

| Column | Type | Nullable | Notes |
| --- | --- | --- | --- |
| OBJECTID | OID | unknown | PK, required |
| SOURCE_NAME_ID | Integer | unknown |  |
| SOURCE_NAME | String | yes |  |
| SOURCE_TYPE | String | yes |  |
| DATE_SOURCE_RECEIVED | Integer | yes |  |
| DATE_SOURCE_COMPILED | Integer | yes |  |

### MAD.MAD_STREET_NAME_VARIANTS

| Column | Type | Nullable | Notes |
| --- | --- | --- | --- |
| OBJECTID | OID | unknown | PK, required |
| SOURCE_NAME_ID | Integer | yes |  |
| ID_IN_ORIG_SOURCE | String | yes |  |
| STREET_NAME_VARIANT_ID | Integer | unknown |  |
| FULL_STREET_NAME_INPUT | String | yes |  |
| STREET_NAME_ID | Integer | yes |  |
| FULL_STREET_NAME_PARSED | String | yes |  |
| PRE_DIRECTIONAL | String | yes |  |
| PRE_MODIFIER | String | yes |  |
| PRE_TYPE | String | yes |  |
| STREET_NAME_BASE | String | yes |  |
| POST_DIRECTIONAL | String | yes |  |
| POST_MODIFIER | String | yes |  |
| POST_TYPE | String | yes |  |
| LOCATION | String | yes |  |
| ADDRESS_TOWN_ID | SmallInteger | yes |  |
| COMMUNITY_ID | Integer | yes |  |
| LAST_EDIT_DATE | Integer | yes |  |
| LAST_EDIT_BY | String | yes |  |
| COMMENTS | String | yes |  |
| SNID_FLAG | String | yes |  |

### MAD.MAD_STRUCTURES_POLY

| Column | Type | Nullable | Notes |
| --- | --- | --- | --- |
| OBJECTID | OID | unknown | PK, required |
| STRUCTURE_ID | String | yes |  |
| SOURCE_NAME_ID | Integer | yes |  |
| ID_IN_ORIGINAL_SOURCE | String | yes |  |
| MOVED | String | yes |  |
| BUILDING_AREA_SQ_FT | Double | yes |  |
| GEOGRAPHIC_TOWN_ID | SmallInteger | yes |  |
| GEOGRAPHIC_TOWN_ID_2 | SmallInteger | yes |  |
| GEOGRAPHIC_TOWN_ID_3 | SmallInteger | yes |  |
| LAST_EDIT_DATE | Integer | yes |  |
| LAST_EDIT_BY | String | yes |  |
| LAST_EDIT_COMMENTS | String | yes |  |
| POLY_TYPE | String | yes |  |
| SHAPE | Geometry | yes | required, spatial |
| SHAPE.AREA | Double | yes | required, spatial |
| SHAPE.LEN | Double | yes | required, spatial |
