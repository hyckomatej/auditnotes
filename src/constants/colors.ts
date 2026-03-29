export interface AuditColor {
    label: string;
    background: string;
    vibrant: string;
}

export const AUDIT_COLORS: AuditColor[] = [
    { 
        label: 'White', 
        background: 'rgba(255, 255, 255, 0.2)', 
        vibrant: 'rgba(255, 255, 255, 1.0)' 
    },
    { 
        label: 'Red', 
        background: 'rgba(255, 82, 82, 0.15)', 
        vibrant: 'rgba(255, 82, 82, 1.0)' 
    },
    { 
        label: 'Blue', 
        background: 'rgba(33, 150, 243, 0.15)', 
        vibrant: 'rgba(33, 150, 243, 1.0)' 
    },
    { 
        label: 'Green', 
        background: 'rgba(76, 175, 80, 0.15)', 
        vibrant: 'rgba(76, 175, 80, 1.0)' 
    },
    { 
        label: 'Yellow', 
        background: 'rgba(255, 235, 59, 0.15)', 
        vibrant: 'rgba(255, 235, 59, 1.0)' 
    },
    { 
        label: 'Purple', 
        background: 'rgba(156, 39, 176, 0.15)', 
        vibrant: 'rgba(156, 39, 176, 1.0)' 
    },
    { 
        label: 'Orange', 
        background: 'rgba(255, 152, 0, 0.15)', 
        vibrant: 'rgba(255, 152, 0, 1.0)' 
    },
    { 
        label: 'Cyan', 
        background: 'rgba(0, 188, 212, 0.15)', 
        vibrant: 'rgba(0, 188, 212, 1.0)' 
    },
    { 
        label: 'Pink', 
        background: 'rgba(233, 30, 99, 0.15)', 
        vibrant: 'rgba(233, 30, 99, 1.0)' 
    },
    { 
        label: 'Teal', 
        background: 'rgba(0, 150, 136, 0.15)', 
        vibrant: 'rgba(0, 150, 136, 1.0)' 
    },
];

export function getAuditColorByBackground(background: string): AuditColor | undefined {
    return AUDIT_COLORS.find(c => c.background === background);
}
