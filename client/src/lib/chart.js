import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);
ChartJS.defaults.font.family = "'Inter', system-ui, sans-serif";

export function tooltipTheme(ui) {
  return {
    backgroundColor: ui.card,
    titleColor: ui.text,
    bodyColor: ui.text,
    borderColor: ui.border,
    borderWidth: 1,
    padding: 10,
    cornerRadius: 8,
    displayColors: false,
    titleFont: { weight: '600' },
  };
}
