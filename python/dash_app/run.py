import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dash_app.app import app
from dash_app.layout import create_layout
import dash_app.callbacks  # noqa — registers callbacks

app.layout = create_layout()

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=8050)
