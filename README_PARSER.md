# Excel Parser for Bookem Heatmap

This Python script parses Excel files and converts them to JSON or TypeScript format for use in the heatmap application.

## Installation

Install the required dependencies:

```bash
pip install -r requirements.txt
```

## Usage

### Basic Usage

```bash
python parse_excel.py <excel_file> [output_format] [output_file]
```

### Examples

1. Parse Excel file and export to JSON:
```bash
python parse_excel.py data.xlsx json output.json
```

2. Parse Excel file and export to TypeScript:
```bash
python parse_excel.py data.xlsx ts data.ts
```

3. Parse with default settings (exports to data.json):
```bash
python parse_excel.py data.xlsx
```

## Excel File Format

The parser expects Excel files with the following structure:

### Book Data Sheet
- **lat** (or latitude, y, coord_y): Latitude coordinate
- **lng** (or lon, long, longitude, x, coord_x): Longitude coordinate
- **count** (or books, book_count, quantity, num): Number of books

### Volunteers Sheet
- **id** (or volunteer_id, vol_id): Volunteer ID
- **lat** (or latitude, y): Latitude coordinate
- **lng** (or lon, long, longitude, x): Longitude coordinate
- **name** (or volunteer_name, vol_name, full_name): Volunteer name
- **books** (or book_count, books_distributed): Number of books distributed

### Schools Sheet
- **id** (or school_id): School ID
- **lat** (or latitude, y): Latitude coordinate
- **lng** (or lon, long, longitude, x): Longitude coordinate
- **name** (or school_name, school): School name
- **students** (or student_count, num_students): Number of students

## Column Auto-Detection

The parser automatically detects column names based on common patterns. It's case-insensitive and supports various naming conventions.

## Customization

You can customize the parser by modifying the `parse_excel_file` function call in `main()`:

```python
data = parse_excel_file(
    excel_file,
    sheet_names={
        'books': 'BookData',      # Specify sheet name
        'volunteers': 'Volunteers',
        'schools': 'Schools'
    },
    column_mappings={
        'books': {
            'lat': 'Latitude',
            'lng': 'Longitude',
            'count': 'BookCount'
        }
    }
)
```

## Output Format

### JSON Output
```json
{
  "bookData": [
    {
      "lat": 36.1627,
      "lng": -86.7816,
      "count": 450
    }
  ],
  "volunteers": [
    {
      "id": 1,
      "lat": 36.1627,
      "lng": -86.7816,
      "name": "Sarah Johnson",
      "books": 45
    }
  ],
  "schools": [
    {
      "id": 1,
      "lat": 36.165,
      "lng": -86.78,
      "name": "Nashville Central High",
      "students": 850
    }
  ]
}
```

### TypeScript Output
The TypeScript output generates separate constants for `bookData`, `volunteers`, and `schools` that can be directly imported into your React application.


